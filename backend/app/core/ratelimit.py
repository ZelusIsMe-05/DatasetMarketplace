"""Rate limit theo tài khoản (user id trong JWT) hoặc theo IP nếu chưa đăng nhập."""
from __future__ import annotations

import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def _key(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            # Chỉ tin `sub` khi chữ ký JWT hợp lệ, tránh giả `sub` để lách giới hạn.
            secret = request.app.state.settings.jwt_secret
            claims = jwt.decode(auth[7:], secret, algorithms=["HS256"])
            if claims.get("sub"):
                return f"user:{claims['sub']}"
        except (jwt.PyJWTError, AttributeError):
            pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_key, default_limits=[])

# Giới hạn theo nhóm thao tác; create_app cập nhật từ Settings (RATE_LIMIT_FAUCET...).
LIMITS: dict[str, str] = {
    "auth": "30/minute",
    "prompt": "30/minute",
    "upload": "12/minute",
    "relay": "10/minute",
    "download": "20/minute",
    "faucet": "5/hour",
}


def _dyn(name: str):  # noqa: ANN202 - slowapi chấp nhận callable trả chuỗi giới hạn
    return lambda: LIMITS[name]


AUTH = _dyn("auth")
PROMPT = _dyn("prompt")
UPLOAD = _dyn("upload")
RELAY = _dyn("relay")
DOWNLOAD = _dyn("download")
FAUCET = _dyn("faucet")
