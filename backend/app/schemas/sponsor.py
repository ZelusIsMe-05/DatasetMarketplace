"""Giao dịch nền tảng trả phí mạng hộ (implementation-plan §3 #25): báo giá + chữ ký cần có, và kết quả."""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import Money, TypedDataResponse


class PermitSign(BaseModel):
    """Chữ ký EIP-2612 cho phép hợp đồng trừ đúng `value` từ ví (domain của token)."""

    typed_data: dict
    value: int
    nonce: int
    deadline: int


class SponsoredQuote(BaseModel):
    """Hóa đơn hiển thị trước khi ký. Mọi số tiền có cả VNĐ và đơn vị on-chain."""

    action: str = Field(description="create | buy | withdraw | withdraw_seed")
    payer: str
    amount: Money = Field(description="Số tiền chính: quỹ mồi / giá mua / số tiền đang chờ rút")
    fee: Money = Field(description="Phí xử lý (đã gồm phí mạng nền tảng trả hộ)")
    total: Money = Field(description="create/buy: tổng trừ khỏi ví; withdraw: số thực nhận")
    balance: Money | None = Field(default=None, description="Số dư token hiện có của ví (create/buy)")
    can_submit: bool
    reason: str | None = None
    sign: TypedDataResponse | None = Field(default=None, description="EIP-712 của thao tác (domain DatasetMarketplace)")
    permit: PermitSign | None = Field(default=None, description="null nếu allowance đã đủ hoặc không cần trừ tiền")


class FeeSchedule(BaseModel):
    """Bảng phí xử lý hiện hành (đã gồm phí mạng nền tảng trả hộ) để hiện trên hóa đơn trước khi ký."""

    mode: str = Field(description='"fixed" (cố định). Dự kiến: "gas_margin" (tiền gas thực tế + % biên)')
    create: Money
    buy: Money
    withdraw: Money
    claim: Money = Field(description="Phí rút hộ của người ghi âm (claimFee on-chain)")


class PermitSubmit(BaseModel):
    value: int = Field(ge=0)
    deadline: int
    signature: str


class SponsoredCreateRequest(BaseModel):
    fee: int = Field(ge=0)
    deadline: int
    signature: str
    permit: PermitSubmit | None = None


class SponsoredBuyRequest(BaseModel):
    buyer: str
    max_price: int = Field(gt=0)
    fee: int = Field(ge=0)
    deadline: int
    signature: str
    permit: PermitSubmit | None = None


class SponsoredWithdrawRequest(BaseModel):
    account: str
    fee: int = Field(ge=0)
    deadline: int
    signature: str


class SponsoredSeedWithdrawRequest(BaseModel):
    fee: int = Field(ge=0)
    deadline: int
    signature: str


class SponsoredResult(BaseModel):
    action: str
    tx_hash: str
    amount: Money = Field(description="create: quỹ mồi; buy: giá; withdraw: số tiền thực nhận")
    fee: Money
    campaign_id: int | None = None
