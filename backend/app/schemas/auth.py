from __future__ import annotations

from pydantic import BaseModel, Field


class ChallengeResponse(BaseModel):
    address: str
    nonce: str
    message: str = Field(description="Thông điệp để ví ký bằng personal_sign (EIP-191)")
    expires_at: int


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(description="Google ID token từ Google Identity Services")
    address: str
    nonce: str
    signature: str


class DevLoginRequest(BaseModel):
    email: str
    address: str
    nonce: str
    signature: str


class SessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: int
    user_id: int
    email: str
    wallet_address: str


class MeResponse(BaseModel):
    user_id: int
    email: str
    wallet_address: str
    auth_provider: str
