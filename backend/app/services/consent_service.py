"""Đồng thuận EIP-712 (§6.3): chuẩn bị dữ liệu ký, xác minh off-chain, relayer gửi giveConsentWithSig."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.eip712 import consent_message, recover_typed, typed_data
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.errors import BadRequest, Conflict, NotFound, Unauthorized
from app.models import Consent, User
from app.repositories.queries import CampaignRepo
from app.schemas.common import TypedDataResponse
from app.schemas.contribution import ConsentResponse, ConsentStatus
from app.services.campaign_service import keccak_text

SIGNATURE_WINDOW_SEC = 3600  # deadline mặc định khi chuẩn bị chữ ký
MAX_DEADLINE_SEC = 86_400  # không nhận chữ ký có hạn quá 1 ngày


class ConsentService:
    def __init__(self, sf: sessionmaker[Session], chain: ChainClient, relayer: Relayer, indexer: EventIndexer):
        self.sf, self.chain, self.relayer, self.indexer = sf, chain, relayer, indexer

    def _verified_terms_hash(self, campaign_id: int) -> str:
        view = self.chain.campaign(campaign_id)
        if view is None:
            raise NotFound("Không tìm thấy chiến dịch")
        self.indexer.sync_if_stale()
        with self.sf() as s:
            draft = CampaignRepo.draft_for(s, campaign_id)
            if draft is None or keccak_text(draft.terms_text) != view.terms_hash:
                # Không để người dùng ký đồng thuận với điều khoản mà server không phục vụ được đúng bản
                raise Conflict("Điều khoản của chiến dịch chưa được xác minh khớp termsHash on-chain")
        return view.terms_hash

    def typed_data(self, user: User, campaign_id: int) -> TypedDataResponse:
        terms_hash = self._verified_terms_hash(campaign_id)
        nonce = self.chain.nonce_of(user.wallet_address)
        deadline = self.chain.block_timestamp() + SIGNATURE_WINDOW_SEC
        msg = consent_message(campaign_id, user.wallet_address, terms_hash, nonce, deadline)
        return TypedDataResponse(typed_data=typed_data(self.chain.domain(), "Consent", msg), nonce=nonce, deadline=deadline)

    def status(self, user: User, campaign_id: int) -> ConsentStatus:
        at = self.chain.consent_at(campaign_id, user.wallet_address)
        return ConsentStatus(campaign_id=campaign_id, contributor=user.wallet_address, consented=at > 0, consented_at=at)

    def submit(self, user: User, campaign_id: int, deadline: int, signature: str) -> ConsentResponse:
        terms_hash = self._verified_terms_hash(campaign_id)
        addr = user.wallet_address
        existing = self.chain.consent_at(campaign_id, addr)
        if existing:
            return ConsentResponse(
                campaign_id=campaign_id, contributor=addr, consented_at=existing, terms_hash=terms_hash,
                tx_hash=None, already=True,
            )
        now = self.chain.block_timestamp()
        if deadline <= now:
            raise BadRequest("Chữ ký đã hết hạn")
        if deadline > now + MAX_DEADLINE_SEC:
            raise BadRequest("deadline quá xa (tối đa 1 ngày)")
        nonce = self.chain.nonce_of(addr)
        td = typed_data(self.chain.domain(), "Consent", consent_message(campaign_id, addr, terms_hash, nonce, deadline))
        try:
            signer = recover_typed(td, signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không đúng định dạng") from e
        if signer != addr:
            raise Unauthorized("Chữ ký không khớp ví của tài khoản (sai nonce, deadline hoặc termsHash?)")
        res = self.relayer.send(
            self.chain.contract.functions.giveConsentWithSig(campaign_id, addr, deadline, bytes.fromhex(signature[2:])),
            kind="consent",
            meta={"campaign_id": campaign_id, "contributor": addr},
        )
        self.indexer.sync()
        with self.sf() as s:
            row = s.scalar(select(Consent).where(Consent.campaign_id == campaign_id, Consent.address == addr))
            if row is not None:
                row.via_relayer = True
                s.commit()
        return ConsentResponse(
            campaign_id=campaign_id,
            contributor=addr,
            consented_at=self.chain.consent_at(campaign_id, addr),
            terms_hash=terms_hash,
            tx_hash=res.tx_hash,
        )
