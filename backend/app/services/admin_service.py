"""Quản trị: hàng chờ vùng xám (§10.1), thử lại giao dịch chưa thành công, trạng thái relayer (§15)."""
from __future__ import annotations

import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.blockchain.client import ChainClient
from app.blockchain.indexer import EventIndexer
from app.blockchain.relayer import Relayer
from app.core.config import Settings
from app.core.errors import Conflict, NotFound
from app.models import Contribution, ContributionStatus, Prompt, RelayTx
from app.schemas.admin import RelayerStatus, ReviewItem
from app.schemas.contribution import ContributionResult
from app.services.contribution_service import ContributionService
from app.services.fx_service import FxService
from app.services.storage import PrivateStorage

LOW_BALANCE_WEI = 5 * 10**16  # 0,05 AVAX


class AdminService:
    def __init__(
        self,
        settings: Settings,
        sf: sessionmaker[Session],
        chain: ChainClient,
        relayer: Relayer,
        qc_signer: Relayer,
        indexer: EventIndexer,
        contributions: ContributionService,
        storage: PrivateStorage,
        fx: FxService,
    ):
        self.settings, self.sf, self.chain, self.relayer, self.qc_signer = settings, sf, chain, relayer, qc_signer
        self.indexer, self.contributions, self.storage, self.fx = indexer, contributions, storage, fx

    def review_queue(self, include_pending_chain: bool = True) -> list[ReviewItem]:
        statuses = [ContributionStatus.GRAY] + ([ContributionStatus.PENDING_CHAIN] if include_pending_chain else [])
        with self.sf() as s:
            rows = s.scalars(select(Contribution).where(Contribution.status.in_(statuses)).order_by(Contribution.id))
            return [
                ReviewItem(
                    id=c.id,
                    campaign_id=c.campaign_id,
                    address=c.address,
                    prompt_text=s.get(Prompt, c.prompt_id).text,
                    status=c.status,
                    duration_sec=round(c.duration_sec, 2),
                    weight_sec=c.weight_sec,
                    qc=json.loads(c.qc_json) if c.qc_json else None,
                    audio_url=f"{self.settings.api_public_url}/admin/review/{c.id}/audio",
                    error=c.error,
                    created_at=int(c.created_at.timestamp()),
                )
                for c in rows
            ]

    def review_audio(self, contribution_id: int) -> bytes:
        with self.sf() as s:
            c = s.get(Contribution, contribution_id)
            if c is None or c.status not in (ContributionStatus.GRAY, ContributionStatus.PENDING_CHAIN):
                raise NotFound("Không có bản ghi chờ duyệt này")
            return self.storage.read(c.audio_path)

    def decide(self, contribution_id: int, decision: str, note: str | None) -> ContributionResult:
        with self.sf() as s:
            c = s.get(Contribution, contribution_id)
            if c is None:
                raise NotFound("Không tìm thấy bản ghi")
            if c.status not in (ContributionStatus.GRAY, ContributionStatus.PENDING_CHAIN):
                raise Conflict(f"Bản ghi đang ở trạng thái {c.status}, không duyệt được")
            c.review_note = note
            if decision == "reject":
                self.storage.delete(c.audio_path)
                c.audio_path, c.salt_hex, c.audio_sha256, c.commitment = None, None, None, None
                c.status = ContributionStatus.REJECTED
                c.updated_at = datetime.now(UTC)
                s.commit()
                return self.contributions._result(contribution_id, None, "Đã loại sau khi duyệt tay")  # noqa: SLF001
            s.commit()
        return self.contributions.register(contribution_id)

    def relayer_status(self) -> RelayerStatus:
        rate = self.fx.rate()
        rel_bal = self.relayer.balance_wei()
        qc_bal = self.qc_signer.balance_wei()
        onchain_qc = self.chain.qc_oracle()
        collector = self.chain.fee_collector()
        with self.sf() as s:
            recent = [
                {"id": r.id, "kind": r.kind, "status": r.status, "tx_hash": r.tx_hash, "error": r.error,
                 "created_at": int(r.created_at.timestamp())}
                for r in s.scalars(select(RelayTx).order_by(RelayTx.id.desc()).limit(20))
            ]
        return RelayerStatus(
            relayer_address=self.relayer.address,
            qc_oracle_address=self.qc_signer.address,
            onchain_qc_oracle=onchain_qc,
            qc_oracle_matches=onchain_qc == self.qc_signer.address,
            relayer_balance_avax=rel_bal / 1e18,
            qc_oracle_balance_avax=qc_bal / 1e18,
            low_balance=min(rel_bal, qc_bal) < LOW_BALANCE_WEI,
            fee_collector=collector,
            claim_fee=self.fx.money(self.chain.claim_fee(), rate),
            fee_collector_withdrawable=self.fx.money(self.chain.withdrawable(collector), rate),
            recent=recent,
        )
