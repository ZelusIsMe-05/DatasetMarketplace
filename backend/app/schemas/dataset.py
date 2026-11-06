from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Money


class SnapshotResponse(BaseModel):
    campaign_id: int
    version: int
    merkle_root: str
    uri: str
    leaf_count: int
    total_sec: int
    tx_hash: str | None
    status: str


class DownloadRequest(BaseModel):
    buyer: str = Field(description="Địa chỉ ví người mua (đã mua license)")
    issued_at: int = Field(description="Unix time trong thông điệp đã ký")
    nonce: str = Field(min_length=8, max_length=64, description="Nonce trong thông điệp đã ký")
    signature: str = Field(description="personal_sign của thông điệp GET /datasets/{id}/download-message")


class DownloadMessage(BaseModel):
    campaign_id: int
    buyer: str
    issued_at: int
    nonce: str
    message: str


class DownloadResponse(BaseModel):
    campaign_id: int
    buyer: str
    download_url: str
    expires_at: int
    snapshot: SnapshotResponse
    license_price_paid: Money


class FaucetRequest(BaseModel):
    address: str
    amount_usdc: int = Field(default=2000, gt=0)


class FaucetResponse(BaseModel):
    address: str
    minted: Money
    balance: Money
    tx_hash: str
