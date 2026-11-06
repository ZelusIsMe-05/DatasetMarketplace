from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Money


class CampaignDraftRequest(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    purpose: str = Field(min_length=3, max_length=2000)
    license: str = Field(default="research-and-commercial", max_length=64)
    language: str = Field(default="vi", max_length=32)
    accent: str | None = Field(default=None, max_length=64)
    prompts: list[str] = Field(min_length=1, max_length=5000)
    terms_text: str = Field(min_length=50, max_length=50_000)
    target_sec: int = Field(gt=0, le=2**63 - 1, description="Mục tiêu (giây), ví dụ 36000 = 10 giờ")
    full_price_vnd: int = Field(gt=0, description="Giá đầy đủ nhập bằng VNĐ, app quy đổi sang USDC")
    contributor_bps: int = Field(default=8000, ge=0, le=10_000)
    creator_bps: int = Field(default=1000, ge=0, le=10_000)
    duration_days: int = Field(default=30, ge=1, le=365)
    seed_vnd: int = Field(default=0, ge=0, description="Quỹ mồi (VNĐ), tùy chọn")
    seed_vnd_per_minute: int = Field(default=0, ge=0, description="Tiền mồi trả mỗi phút hợp lệ (VNĐ)")


class CreateCampaignArgs(BaseModel):
    """Tham số gọi `createCampaign` (người tạo tự ký bằng Core/MetaMask)."""

    targetSec: int
    fullPrice: int
    contributorBps: int
    creatorBps: int
    deadline: int
    promptSetHash: str
    termsHash: str
    metadataURI: str
    seedRatePerSec: int
    seedAmount: int


class CampaignDraftResponse(BaseModel):
    draft_id: str
    metadata_uri: str
    prompt_count: int
    fx_rate: float
    full_price: Money
    seed_amount: Money
    contract: str
    token: str
    create_campaign_args: CreateCampaignArgs
    note: str


class Split(BaseModel):
    contributor_bps: int
    creator_bps: int
    platform_bps: int


class SnapshotRef(BaseModel):
    version: int
    merkle_root: str
    uri: str
    leaf_count: int
    total_sec: int
    status: str
    tx_hash: str | None


class CampaignSummary(BaseModel):
    id: int
    name: str | None
    accent: str | None
    metadata_verified: bool
    creator: str
    progress_bps: int
    total_sec: int
    target_sec: int
    price: Money
    full_price: Money
    is_collecting: bool
    status: str
    deadline: int


class CampaignDetail(CampaignSummary):
    description: str | None
    purpose: str | None
    license: str | None
    language: str | None
    split: Split
    contributors: int
    buyers: int
    revenue_total: Money
    seed_rate_per_sec: Money
    seed_balance: Money
    prompt_count: int
    prompt_set_hash: str
    terms_hash: str
    metadata_uri: str
    samples: list[str]
    latest_snapshot: SnapshotRef | None
    explorer_url: str | None


class TermsResponse(BaseModel):
    campaign_id: int
    terms_text: str
    terms_hash: str = Field(description="keccak256 của văn bản (UTF-8) do server tính")
    onchain_terms_hash: str
    matches: bool


class LicenseResponse(BaseModel):
    campaign_id: int
    buyer: str
    licensed: bool
    purchased_at: int
    progress_bps_at_purchase: int
    price_paid: Money


class PurchaseItem(BaseModel):
    buyer: str
    price: Money
    progress_bps: int
    block: int
    tx_hash: str


class RevenueResponse(BaseModel):
    campaign_id: int
    sales: int
    total: Money
    to_contributors: Money
    to_creator: Money
    to_platform: Money
    purchases: list[PurchaseItem]
    creator_withdrawable: Money = Field(description="withdrawable(creator) on-chain — cộng dồn mọi chiến dịch của người tạo")
    note: str


class PriceQuote(BaseModel):
    campaign_id: int
    progress_bps: int
    price: Money
    full_price: Money
    can_buy: bool
    reason: str | None
    contract: str
    token: str
