"""Chủ chiến dịch sở hữu dữ liệu của chiến dịch (implementation-plan §3 #28): duyệt vùng xám, công bố phiên bản.

Mọi endpoint cần phiên đăng nhập của đúng ví người tạo chiến dịch; không có vai trò quản trị.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from fastapi.responses import Response

from app.api.deps import ContainerDep, CurrentUser
from app.core import ratelimit
from app.core.ratelimit import limiter
from app.schemas.contribution import ContributionResult
from app.schemas.dataset import SnapshotResponse
from app.schemas.review import ReviewDecision, ReviewItem, SnapshotPublishRequest, SnapshotQuote

router = APIRouter(tags=["creator"])
CampaignId = Annotated[int, Path(ge=0, description="campaignId on-chain")]


@router.get("/creator/review")
def review_queue(
    c: ContainerDep, user: CurrentUser, campaign_id: Annotated[int | None, Query(ge=0)] = None
) -> list[ReviewItem]:
    """Bản ghi vùng xám chờ duyệt của các chiến dịch do ví đang đăng nhập tạo."""
    return c.review.queue(user, campaign_id)


@router.get("/creator/review/{contribution_id}/audio", response_class=Response)
def review_audio(c: ContainerDep, user: CurrentUser, contribution_id: int) -> Response:
    """Nghe bản ghi chờ duyệt (chỉ chủ chiến dịch đó)."""
    return Response(c.review.audio(user, contribution_id), media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.post("/creator/review/{contribution_id}")
@limiter.limit(ratelimit.RELAY)
def review_decide(
    request: Request, c: ContainerDep, user: CurrentUser, contribution_id: int, body: ReviewDecision
) -> ContributionResult:
    """Duyệt ⇒ ghi nhận on-chain (trả tiền mồi). Loại ⇒ xóa audio; bắt buộc ghi lý do."""
    return c.review.decide(user, contribution_id, body.decision, body.note)


@router.get("/campaigns/{campaign_id}/snapshot-quote")
def snapshot_quote(c: ContainerDep, user: CurrentUser, campaign_id: CampaignId) -> SnapshotQuote:
    """Bản tóm tắt phiên bản sắp công bố (số bản ghi, tổng giây, mã Merkle) + dữ liệu PublishSnapshot để ký."""
    return c.datasets.snapshot_quote(user, campaign_id)


@router.post("/campaigns/{campaign_id}/snapshots")
@limiter.limit(ratelimit.RELAY)
def publish_snapshot(
    request: Request, c: ContainerDep, user: CurrentUser, campaign_id: CampaignId, body: SnapshotPublishRequest
) -> SnapshotResponse:
    """Chủ chiến dịch đã ký ⇒ relayer gọi publishSnapshotWithSig (nền tảng trả phí mạng)."""
    return c.datasets.publish_signed(user, campaign_id, body)
