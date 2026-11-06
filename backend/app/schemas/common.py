from __future__ import annotations

from pydantic import BaseModel, Field


class Money(BaseModel):
    """Mọi số tiền API trả về có cả hai dạng (đề xuất §11): đơn vị on-chain và VNĐ hiển thị."""

    units: int = Field(description="Đơn vị on-chain của token (USDC: 6 số thập phân)")
    vnd: int = Field(description="VNĐ đã quy đổi theo tỷ giá đang dùng (làm tròn đến đồng)")
    display: str = Field(description='Ví dụ "≈ 16.900.000 ₫"')
    token: str = Field(description='Ví dụ "650 USDC trên Avalanche"')


class TxInfo(BaseModel):
    tx_hash: str
    block: int | None = None
    explorer_url: str | None = None


class TypedDataResponse(BaseModel):
    """Dữ liệu EIP-712 sẵn sàng cho eth_signTypedData_v4 (viem `signTypedData`)."""

    typed_data: dict
    nonce: int
    deadline: int


class Message(BaseModel):
    message: str
