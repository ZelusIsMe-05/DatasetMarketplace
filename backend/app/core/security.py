"""Phiên đăng nhập (JWT) và token có hạn ký HMAC (prompt token, link tải dataset)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

import jwt


class TokenError(Exception):
    """Token sai chữ ký, sai mục đích hoặc đã hết hạn."""


# ------------------------------------------------------------------ phiên đăng nhập


def issue_session(secret: str, user_id: int, email: str, address: str, ttl_sec: int) -> tuple[str, int]:
    now = int(time.time())
    exp = now + ttl_sec
    token = jwt.encode(
        {"sub": str(user_id), "email": email, "addr": address, "iat": now, "exp": exp, "typ": "session"},
        secret,
        algorithm="HS256",
    )
    return token, exp


def verify_session(secret: str, token: str) -> dict:
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError as e:
        raise TokenError(str(e)) from e
    if claims.get("typ") != "session":
        raise TokenError("sai loại token")
    return claims


# ------------------------------------------------------------------ token HMAC có hạn


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


@dataclass(frozen=True)
class SignedToken:
    token: str
    jti: str
    issued_at: int
    expires_at: int


def sign_token(secret: str, purpose: str, payload: dict, ttl_sec: int) -> SignedToken:
    """Token dạng `<payload>.<hmac>`; `purpose` tách bạch prompt token và link tải."""
    now = int(time.time())
    jti = secrets.token_urlsafe(16)
    body = {"p": purpose, "jti": jti, "iat": now, "exp": now + ttl_sec, **payload}
    raw = _b64(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(secret.encode(), f"{purpose}.{raw}".encode(), hashlib.sha256).digest()
    return SignedToken(token=f"{raw}.{_b64(mac)}", jti=jti, issued_at=now, expires_at=now + ttl_sec)


def verify_token(secret: str, purpose: str, token: str, now: float | None = None) -> dict:
    try:
        raw, mac_b64 = token.split(".", 1)
        expected = hmac.new(secret.encode(), f"{purpose}.{raw}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(mac_b64)):
            raise TokenError("chữ ký token không hợp lệ")
        body = json.loads(_unb64(raw))
    except (ValueError, json.JSONDecodeError) as e:
        raise TokenError("token không đúng định dạng") from e
    if body.get("p") != purpose:
        raise TokenError("token sai mục đích")
    if (now or time.time()) > body["exp"]:
        raise TokenError("token đã hết hạn")
    return body
