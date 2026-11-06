"""Chiến dịch, câu mẫu, mua bán (đọc)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Path, Request
from fastapi.responses import Response

from app.api.deps import ContainerDep, CurrentUser
from app.core import ratelimit
from app.core.ratelimit import limiter
from app.schemas.campaign import (
    CampaignDetail,
    CampaignDraftRequest,
    CampaignDraftResponse,
    CampaignSummary,
    LicenseResponse,
    PriceQuote,
    RevenueResponse,
    TermsResponse,
)
from app.schemas.contribution import PromptRequest, PromptResponse

router = APIRouter(tags=["campaigns"])
CampaignId = Annotated[int, Path(ge=0, description="campaignId on-chain")]


@router.get("/campaigns")
def list_campaigns(c: ContainerDep) -> list[CampaignSummary]:
    """Danh sách chiến dịch, giá hiện tại dạng VNĐ."""
    return c.campaigns.list()


@router.post("/campaigns/drafts")
def create_draft(c: ContainerDep, user: CurrentUser, body: CampaignDraftRequest) -> CampaignDraftResponse:
    """Người tạo gửi metadata + câu mẫu + điều khoản; server trả tham số createCampaign (hash, giá USDC)."""
    return c.campaigns.create_draft(user, body)


@router.post("/campaigns/sync")
def sync_campaigns(c: ContainerDep) -> dict:
    """Đọc sự kiện mới từ chain (liên kết metadata cho chiến dịch vừa tạo)."""
    n = c.campaigns.sync()
    c.campaigns.relink_unverified()
    return {"processed_events": n, "campaigns": c.campaigns.campaign_ids()}


@router.get("/campaigns/{campaign_id}")
def campaign_detail(c: ContainerDep, campaign_id: CampaignId) -> CampaignDetail:
    """Chi tiết: tiến độ, giá, số người, mẫu nghe thử."""
    return c.campaigns.detail(campaign_id)


@router.get("/campaigns/{campaign_id}/terms")
def campaign_terms(c: ContainerDep, campaign_id: CampaignId) -> TermsResponse:
    """Điều khoản đồng thuận (hash khớp termsHash on-chain)."""
    return c.campaigns.terms(campaign_id)


@router.get("/campaigns/{campaign_id}/price")
def campaign_price(c: ContainerDep, campaign_id: CampaignId) -> PriceQuote:
    return c.market.quote(campaign_id)


@router.get("/campaigns/{campaign_id}/revenue")
def campaign_revenue(c: ContainerDep, campaign_id: CampaignId) -> RevenueResponse:
    return c.market.revenue(campaign_id)


@router.get("/campaigns/{campaign_id}/licenses/{address}")
def campaign_license(c: ContainerDep, campaign_id: CampaignId, address: str) -> LicenseResponse:
    return c.market.license(campaign_id, address)


@router.post("/campaigns/{campaign_id}/prompt")
@limiter.limit(ratelimit.PROMPT)
def issue_prompt(
    request: Request,
    c: ContainerDep,
    user: CurrentUser,
    campaign_id: CampaignId,
    body: Annotated[PromptRequest | None, Body()] = None,
) -> PromptResponse:
    """Cấp câu mẫu chưa đọc + prompt token (ký HMAC, hết hạn ~60 giây)."""
    return c.prompts.issue(user, campaign_id, body.prompt_index if body else None)


@router.get("/campaigns/{campaign_id}/samples/{contribution_id}", response_class=Response)
def campaign_sample(c: ContainerDep, campaign_id: CampaignId, contribution_id: int) -> Response:
    return Response(c.datasets.sample_audio(campaign_id, contribution_id), media_type="audio/wav")


@router.get("/metadata/{draft_id}")
def metadata(c: ContainerDep, draft_id: str) -> dict:
    """Nội dung metadataURI của chiến dịch (không công bố câu mẫu)."""
    return c.campaigns.public_metadata(draft_id)
