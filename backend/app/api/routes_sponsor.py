"""Giao dịch nền tảng trả phí mạng hộ (implementation-plan §3 #25): báo giá → người dùng ký → relayer gửi.

Mỗi thao tác có cặp: GET …-quote (hóa đơn VNĐ + dữ liệu EIP-712 cần ký) và POST (nhận chữ ký, relayer gửi).
Người mua không cần đăng nhập: chính chữ ký Buy + permit chứng minh chủ ví.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from app.api.deps import ContainerDep, CurrentUser
from app.core import ratelimit
from app.core.ratelimit import limiter
from app.schemas.sponsor import (
    FeeSchedule,
    SponsoredBuyRequest,
    SponsoredCreateRequest,
    SponsoredQuote,
    SponsoredResult,
    SponsoredSeedWithdrawRequest,
    SponsoredWithdrawRequest,
)

router = APIRouter(tags=["sponsored"])
CampaignId = Annotated[int, Path(ge=0, description="campaignId on-chain")]
DraftId = Annotated[str, Path(min_length=1, max_length=36)]


@router.get("/fees")
def fees(c: ContainerDep) -> FeeSchedule:
    """Bảng phí xử lý hiện hành (VNĐ + USDC) cho hóa đơn trước khi ký."""
    return c.sponsor.fees()


@router.get("/campaigns/drafts/{draft_id}/create-quote")
def create_quote(c: ContainerDep, user: CurrentUser, draft_id: DraftId) -> SponsoredQuote:
    """Hóa đơn tạo chiến dịch (quỹ mồi + phí xử lý) và chữ ký cần có: CreateCampaign + permit."""
    return c.sponsor.create_quote(user, draft_id)


@router.post("/campaigns/drafts/{draft_id}/create")
@limiter.limit(ratelimit.RELAY)
def create_campaign(
    request: Request, c: ContainerDep, user: CurrentUser, draft_id: DraftId, body: SponsoredCreateRequest
) -> SponsoredResult:
    """Relayer gọi createCampaignWithSig; người tạo không cần AVAX."""
    return c.sponsor.create(user, draft_id, body)


@router.get("/campaigns/{campaign_id}/buy-quote")
def buy_quote(c: ContainerDep, campaign_id: CampaignId, buyer: Annotated[str, Query()]) -> SponsoredQuote:
    """Hóa đơn mua (giá theo tiến độ + phí xử lý) và chữ ký cần có: Buy + permit."""
    return c.sponsor.buy_quote(campaign_id, buyer)


@router.post("/campaigns/{campaign_id}/buy")
@limiter.limit(ratelimit.RELAY)
def buy(request: Request, c: ContainerDep, campaign_id: CampaignId, body: SponsoredBuyRequest) -> SponsoredResult:
    """Relayer gọi buyWithSig; người mua không cần AVAX."""
    return c.sponsor.buy(campaign_id, body)


@router.get("/creator/withdraw-quote")
def withdraw_quote(c: ContainerDep, address: Annotated[str, Query()]) -> SponsoredQuote:
    """Doanh thu người tạo đang chờ rút, phí xử lý, số thực nhận và chữ ký Withdraw."""
    return c.sponsor.withdraw_quote(address)


@router.post("/creator/withdraw")
@limiter.limit(ratelimit.RELAY)
def withdraw(request: Request, c: ContainerDep, body: SponsoredWithdrawRequest) -> SponsoredResult:
    return c.sponsor.withdraw(body)


@router.get("/campaigns/{campaign_id}/seed-withdraw-quote")
def seed_withdraw_quote(c: ContainerDep, campaign_id: CampaignId) -> SponsoredQuote:
    """Quỹ mồi còn dư (rút được sau hạn chiến dịch), phí xử lý và chữ ký WithdrawSeed."""
    return c.sponsor.seed_quote(campaign_id)


@router.post("/campaigns/{campaign_id}/withdraw-seed")
@limiter.limit(ratelimit.RELAY)
def withdraw_seed(
    request: Request, c: ContainerDep, campaign_id: CampaignId, body: SponsoredSeedWithdrawRequest
) -> SponsoredResult:
    return c.sponsor.withdraw_seed(campaign_id, body)
