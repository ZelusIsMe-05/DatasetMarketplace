from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Money, TypedDataResponse


class ConsentRequest(BaseModel):
    campaign_id: int = Field(ge=0)
    deadline: int = Field(gt=0, description="Đúng giá trị deadline đã ký")
    signature: str


class ConsentResponse(BaseModel):
    campaign_id: int
    contributor: str
    consented_at: int
    terms_hash: str
    tx_hash: str | None
    already: bool = False


class ConsentStatus(BaseModel):
    campaign_id: int
    contributor: str
    consented: bool
    consented_at: int


class PromptRequest(BaseModel):
    prompt_index: int | None = Field(
        default=None,
        ge=0,
        description="CHỈ local + DEV_AUTH: chọn câu thứ N (0-based) để kiểm thử bằng file. Môi trường khác bỏ qua.",
    )


class PromptResponse(BaseModel):
    campaign_id: int
    prompt_id: int
    prompt_index: int
    text: str
    token: str
    issued_at: int
    expires_at: int
    remaining_prompts: int


class QcReport(BaseModel):
    decision: str
    reasons: list[str]
    duration_sec: float
    speech_sec: float
    chars_per_sec: float | None
    cer: float | None
    align_score: float | None
    word_scores: list[dict]
    hypothesis: str


class ContributionResult(BaseModel):
    id: int
    campaign_id: int
    prompt_id: int
    status: str
    qc: QcReport | None
    weight_sec: int
    onchain_id: int | None
    commitment: str | None
    tx_hash: str | None
    seed_paid: Money | None
    message: str


class ContributionItem(BaseModel):
    id: int
    campaign_id: int
    prompt_text: str
    status: str
    duration_sec: float
    weight_sec: int
    onchain_id: int | None
    tx_hash: str | None
    revoke_tx_hash: str | None
    reasons: list[str]
    created_at: int


class CampaignEarnings(BaseModel):
    campaign_id: int
    active_weight_sec: int
    pending: Money


class MyContributions(BaseModel):
    address: str
    contributions: list[ContributionItem]
    earnings: list[CampaignEarnings]
    total_pending: Money


class ClaimQuote(BaseModel):
    campaign_id: int
    contributor: str
    pending: Money
    fee: Money
    net: Money
    can_claim: bool
    reason: str | None
    sign: TypedDataResponse | None


class ClaimRequest(BaseModel):
    campaign_id: int = Field(ge=0)
    max_fee: int = Field(ge=0)
    deadline: int = Field(gt=0)
    signature: str


class ClaimResponse(BaseModel):
    campaign_id: int
    contributor: str
    received: Money
    fee: Money
    tx_hash: str


class RevokeRequest(BaseModel):
    contribution_id: int = Field(ge=0, description="ID bản ghi on-chain (onchain_id)")
    deadline: int = Field(gt=0)
    signature: str


class RevokeResponse(BaseModel):
    contribution_id: int
    campaign_id: int
    revoked_at: int
    tx_hash: str
    audio_deleted: bool
    new_progress_bps: int
    new_price: Money
    # Phiên bản đang hợp lệ sau thu hồi; None = phiên bản cũ đã bị khóa, chờ chủ chiến dịch ký công bố bản mới
    new_snapshot_version: int | None
