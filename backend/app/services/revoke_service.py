"""Thu hồi đồng thuận (§6.8): người dùng ký Revoke, relayer gửi revokeWithSig.

Việc xóa audio + salt và phát hành phiên bản dataset mới do DatasetService.purge_revoked đảm nhận,
được gọi qua hook của indexer khi thấy sự kiện ConsentRevoked (bao phủ cả trường hợp người dùng tự gọi `revoke`).
"""
from __future__ import annotations

from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.eip712 import recover_typed, revoke_message, typed_data
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized
from app.models import User
from app.repositories.queries import ContributionRepo, SnapshotRepo
from app.schemas.common import TypedDataResponse
from app.schemas.contribution import RevokeResponse
from app.services.consent_service import MAX_DEADLINE_SEC, SIGNATURE_WINDOW_SEC
from app.services.fx_service import FxService
from app.services.storage import PrivateStorage


class RevokeService:
    def __init__(
        self,
        sf: sessionmaker[Session],
        chain: ChainClient,
        relayer: Relayer,
        indexer: EventIndexer,
        storage: PrivateStorage,
        fx: FxService,
    ):
        self.sf, self.chain, self.relayer, self.indexer, self.storage, self.fx = sf, chain, relayer, indexer, storage, fx

    def _owned(self, user: User, contribution_id: int):  # noqa: ANN202
        rec = self.chain.contribution(contribution_id)
        if rec is None:
            raise NotFound("Không tìm thấy bản ghi on-chain")
        if rec.contributor != user.wallet_address:
            raise Forbidden("Bản ghi không thuộc về bạn")
        if rec.revoked_at:
            raise Conflict("Bản ghi đã được thu hồi", code="AlreadyRevoked")
        return rec

    def typed_data(self, user: User, contribution_id: int) -> TypedDataResponse:
        self._owned(user, contribution_id)
        nonce = self.chain.nonce_of(user.wallet_address)
        deadline = self.chain.block_timestamp() + SIGNATURE_WINDOW_SEC
        td = typed_data(self.chain.domain(), "Revoke", revoke_message(contribution_id, nonce, deadline))
        return TypedDataResponse(typed_data=td, nonce=nonce, deadline=deadline)

    def revoke(self, user: User, contribution_id: int, deadline: int, signature: str) -> RevokeResponse:
        rec = self._owned(user, contribution_id)
        now = self.chain.block_timestamp()
        if deadline <= now or deadline > now + MAX_DEADLINE_SEC:
            raise BadRequest("deadline không hợp lệ")
        nonce = self.chain.nonce_of(user.wallet_address)
        td = typed_data(self.chain.domain(), "Revoke", revoke_message(contribution_id, nonce, deadline))
        try:
            signer = recover_typed(td, signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != user.wallet_address:
            raise Unauthorized("Chữ ký Revoke không khớp ví của tài khoản")
        res = self.relayer.send(
            self.chain.contract.functions.revokeWithSig(contribution_id, deadline, bytes.fromhex(signature[2:])),
            kind="revoke",
            meta={"contribution_id": contribution_id},
        )
        with self.sf() as s:
            c = ContributionRepo.by_onchain_id(s, contribution_id)
            if c is not None:
                c.revoke_tx_hash = res.tx_hash
                s.commit()
        self.indexer.sync()  # -> ConsentRevoked -> DatasetService.purge_revoked (xóa audio + salt, snapshot mới)
        view = self.chain.campaign(rec.campaign_id)
        with self.sf() as s:
            c = ContributionRepo.by_onchain_id(s, contribution_id)
            deleted = c is None or (c.audio_path is None and c.salt_hex is None)
            snap = SnapshotRepo.latest(s, rec.campaign_id)
            new_version = snap.version if snap and snap.status == "published" else None
        after = self.chain.contribution(contribution_id)
        return RevokeResponse(
            contribution_id=contribution_id,
            campaign_id=rec.campaign_id,
            revoked_at=after.revoked_at if after else 0,
            tx_hash=res.tx_hash,
            audio_deleted=deleted,
            new_progress_bps=view.progress_bps,
            new_price=self.fx.money(view.current_price),
            new_snapshot_version=new_version,
        )
