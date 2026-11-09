from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Ảnh đại diện chọn từ mẫu có sẵn (màu nền + chữ cái đầu) — không tải ảnh lên máy chủ. "auto" = màu theo địa chỉ ví.
AVATARS = ("auto", "sunset", "ocean", "forest", "berry", "amber", "slate", "rose")
Avatar = Literal["auto", "sunset", "ocean", "forest", "berry", "amber", "slate", "rose"]


class ChallengeResponse(BaseModel):
    address: str
    nonce: str
    message: str = Field(description="Thông điệp để ví ký bằng personal_sign (EIP-191)")
    expires_at: int


_WALLET_HINT = "Chỉ cần ở LẦN ĐẦU (gắn ví với email); email đã gắn ví thì bỏ trống cả ba trường ví"


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(description="Google ID token từ Google Identity Services")
    address: str | None = Field(default=None, description=_WALLET_HINT)
    nonce: str | None = Field(default=None, description="Nonce của GET /auth/challenge (lần đầu)")
    signature: str | None = Field(default=None, description="Chữ ký EIP-191 của challenge (lần đầu)")


class DevLoginRequest(BaseModel):
    email: str
    address: str | None = Field(default=None, description=_WALLET_HINT)
    nonce: str | None = None
    signature: str | None = None


class SessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: int
    user_id: int
    email: str
    wallet_address: str


class ProfileUpdate(BaseModel):
    """Cài đặt tài khoản: bỏ trống trường nào thì giữ nguyên trường đó. Tên rỗng ⇒ dùng lại email để hiển thị."""

    display_name: str | None = Field(default=None, max_length=40, description="Tên hiển thị (tối đa 40 ký tự)")
    avatar: Avatar | None = Field(default=None, description="Mẫu ảnh đại diện")


class MeResponse(BaseModel):
    user_id: int
    email: str
    wallet_address: str
    auth_provider: str
    display_name: str | None = None  # None ⇒ giao diện hiển thị email
    avatar: str = "auto"
