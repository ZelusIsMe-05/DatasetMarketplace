from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Money


class ReviewItem(BaseModel):
    id: int
    campaign_id: int
    address: str
    prompt_text: str
    status: str
    duration_sec: float
    weight_sec: int
    qc: dict | None
    audio_url: str
    error: str | None
    created_at: int


class ReviewDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=1000)


class RelayerStatus(BaseModel):
    relayer_address: str
    qc_oracle_address: str
    onchain_qc_oracle: str
    qc_oracle_matches: bool
    relayer_balance_avax: float
    qc_oracle_balance_avax: float
    low_balance: bool
    fee_collector: str
    claim_fee: Money
    fee_collector_withdrawable: Money
    recent: list[dict]


class SyncResponse(BaseModel):
    processed_events: int
    last_block: int
