"""Chủ chiến dịch sở hữu dữ liệu của chiến dịch (implementation-plan §3 #28): duyệt bản ghi vùng xám + công bố phiên bản."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import TypedDataResponse


class ReviewItem(BaseModel):
    """Bản ghi vùng xám chờ chủ chiến dịch duyệt (audio riêng tư, chỉ chủ chiến dịch đó nghe được)."""

    id: int
    campaign_id: int
    address: str
    prompt_text: str
    status: str
    duration_sec: float
    weight_sec: int
    qc: dict | None
    audio_path: str = Field(description="Đường dẫn API (cần phiên đăng nhập của chủ chiến dịch) để nghe bản ghi")
    created_at: int
    auto_approve_at: int | None = Field(description="Thời điểm tự duyệt nếu chủ chiến dịch chưa quyết định (None = chờ mãi)")


class ReviewDecision(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=1000, description="Bắt buộc khi loại: lý do người đóng góp sẽ thấy")


class ReviewStats(BaseModel):
    """Công khai trên trang chiến dịch để người ghi âm biết chủ chiến dịch duyệt thế nào."""

    pending: int
    approved: int
    auto_approved: int
    rejected: int


class SnapshotQuote(BaseModel):
    """Bản tóm tắt phiên bản sắp công bố + dữ liệu EIP-712 PublishSnapshot để CHỦ CHIẾN DỊCH ký."""

    campaign_id: int
    version: int
    leaf_count: int
    total_sec: int
    merkle_root: str
    uri: str
    latest_version: int | None
    latest_status: str | None = Field(description="published | stale (có bản ghi đã thu hồi) | None (chưa công bố lần nào)")
    changed: bool = Field(description="Dữ liệu khác phiên bản đang công bố (có bản ghi mới hoặc đã thu hồi)")
    sign: TypedDataResponse


class SnapshotPublishRequest(BaseModel):
    merkle_root: str = Field(description="Đúng mã Merkle trong bản tóm tắt đã ký")
    deadline: int
    signature: str
