"""Duyệt bản ghi vùng xám bởi CHỦ CHIẾN DỊCH (implementation-plan §3 #28) — không còn vai trò quản trị.

- Chỉ chủ chiến dịch (ví người tạo, đăng nhập bằng Gmail gắn với ví đó) xem hàng chờ, nghe audio và quyết định cho
  chiến dịch của mình. Loại thì bắt buộc ghi lý do (người đóng góp thấy).
- Quá REVIEW_AUTO_APPROVE_HOURS chưa duyệt ⇒ tự duyệt (người đóng góp không bị treo tiền); 0 = chờ mãi.
- Bản ghi đã đạt QC nhưng giao dịch ghi nhận lỗi tạm thời (PENDING_CHAIN) được nền tảng tự thử lại — đó là việc vận
  hành của nền tảng, không phải quyết định dữ liệu.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.errors import BadRequest, Conflict, Forbidden, NotFound
from app.models import Campaign, Contribution, ContributionStatus, Prompt, User
from app.schemas.contribution import ContributionResult
from app.schemas.review import ReviewItem, ReviewStats
from app.services.contribution_service import ContributionService
from app.services.storage import AudioStorage

log = logging.getLogger("datasetmarketplace.review")
RETRY_PENDING_AFTER = timedelta(minutes=10)


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def review_stats(s: Session, campaign_id: int) -> ReviewStats:
    rows = s.execute(
        select(Contribution.status, Contribution.review_decision).where(Contribution.campaign_id == campaign_id)
    ).all()
    return ReviewStats(
        pending=sum(1 for st, _ in rows if st == ContributionStatus.GRAY),
        approved=sum(1 for _, d in rows if d == "approved"),
        auto_approved=sum(1 for _, d in rows if d == "auto_approved"),
        rejected=sum(1 for _, d in rows if d == "rejected"),
    )


class ReviewService:
    def __init__(
        self, settings: Settings, sf: sessionmaker[Session], contributions: ContributionService, storage: AudioStorage
    ):
        self.settings, self.sf, self.contributions, self.storage = settings, sf, contributions, storage

    def _deadline(self, created_at: datetime) -> datetime | None:
        hours = self.settings.review_auto_approve_hours
        return _utc(created_at) + timedelta(hours=hours) if hours > 0 else None

    @staticmethod
    def _owned(s: Session, user: User) -> set[int]:
        return set(s.scalars(select(Campaign.id).where(Campaign.creator == user.wallet_address)))

    def _own_contribution(self, s: Session, user: User, contribution_id: int) -> Contribution:
        c = s.get(Contribution, contribution_id)
        if c is None:
            raise NotFound("Không tìm thấy bản ghi")
        if c.campaign_id not in self._owned(s, user):
            raise Forbidden("Chỉ chủ chiến dịch được duyệt bản ghi của chiến dịch này", code="not_creator")
        return c

    # ------------------------------------------------------------------ chủ chiến dịch

    def queue(self, user: User, campaign_id: int | None = None) -> list[ReviewItem]:
        with self.sf() as s:
            owned = self._owned(s, user)
            if campaign_id is not None and campaign_id not in owned:
                raise Forbidden("Chỉ chủ chiến dịch được xem hàng chờ duyệt của chiến dịch này", code="not_creator")
            ids = [campaign_id] if campaign_id is not None else sorted(owned)
            if not ids:
                return []
            rows = s.scalars(
                select(Contribution)
                .where(Contribution.status == ContributionStatus.GRAY, Contribution.campaign_id.in_(ids))
                .order_by(Contribution.id)
            )
            out = []
            for c in rows:
                deadline = self._deadline(c.created_at)
                out.append(
                    ReviewItem(
                        id=c.id,
                        campaign_id=c.campaign_id,
                        address=c.address,
                        prompt_text=s.get(Prompt, c.prompt_id).text,
                        status=c.status,
                        duration_sec=round(c.duration_sec, 2),
                        weight_sec=c.weight_sec,
                        qc=json.loads(c.qc_json) if c.qc_json else None,
                        audio_path=f"/creator/review/{c.id}/audio",
                        created_at=int(_utc(c.created_at).timestamp()),
                        auto_approve_at=int(deadline.timestamp()) if deadline else None,
                    )
                )
            return out

    def audio(self, user: User, contribution_id: int) -> bytes:
        with self.sf() as s:
            c = self._own_contribution(s, user, contribution_id)
            if c.status != ContributionStatus.GRAY or not c.audio_path:
                raise NotFound("Bản ghi không còn chờ duyệt")
            path = c.audio_path
        return self.storage.read(path)

    def decide(self, user: User, contribution_id: int, decision: str, note: str | None) -> ContributionResult:
        note = (note or "").strip() or None
        if decision == "reject" and not note:
            raise BadRequest("Hãy ghi lý do loại — người đóng góp sẽ thấy lý do này", code="note_required")
        with self.sf() as s:
            c = self._own_contribution(s, user, contribution_id)
            if c.status != ContributionStatus.GRAY:
                raise Conflict(f"Bản ghi đang ở trạng thái {c.status}, không còn chờ duyệt")
            c.review_note = note
            c.reviewed_at = datetime.now(UTC)
            if decision == "reject":
                self.storage.delete(c.audio_path)
                c.audio_path, c.salt_hex, c.audio_sha256, c.commitment = None, None, None, None
                c.status = ContributionStatus.REJECTED
                c.review_decision = "rejected"
                s.commit()
                return self.contributions._result(contribution_id, None, "Chủ chiến dịch đã loại bản ghi")  # noqa: SLF001
            c.review_decision = "approved"
            s.commit()
        return self.contributions.register(contribution_id)

    # ------------------------------------------------------------------ việc nền (chạy cùng vòng indexer)

    def auto_approve_overdue(self, now: datetime | None = None) -> int:
        """Bản ghi vùng xám quá hạn mà chủ chiến dịch chưa duyệt ⇒ tự duyệt (0 giờ = tắt)."""
        if self.settings.review_auto_approve_hours <= 0:
            return 0
        now = now or datetime.now(UTC)
        with self.sf() as s:
            due = [
                c.id for c in s.scalars(select(Contribution).where(Contribution.status == ContributionStatus.GRAY))
                if (d := self._deadline(c.created_at)) is not None and d <= now
            ]
            for cid in due:
                c = s.get(Contribution, cid)
                c.review_decision, c.reviewed_at = "auto_approved", now
            s.commit()
        for cid in due:
            try:
                self.contributions.register(cid)
            except Exception:  # noqa: BLE001 - để lần sau thử lại (PENDING_CHAIN)
                log.exception("Tự duyệt bản ghi %s: chưa ghi được lên chain", cid)
        return len(due)

    def retry_pending_chain(self, now: datetime | None = None) -> int:
        """Bản ghi đã đạt (hoặc đã được duyệt) nhưng giao dịch ghi nhận lỗi tạm thời ⇒ thử lại sau một lúc."""
        now = now or datetime.now(UTC)
        with self.sf() as s:
            due = [
                c.id for c in s.scalars(select(Contribution).where(Contribution.status == ContributionStatus.PENDING_CHAIN))
                if _utc(c.updated_at) + RETRY_PENDING_AFTER <= now
            ]
        for cid in due:
            try:
                self.contributions.register(cid)
            except Exception:  # noqa: BLE001
                log.exception("Thử ghi lại bản ghi %s lên chain chưa được", cid)
        return len(due)
