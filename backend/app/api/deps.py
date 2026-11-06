from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import Forbidden, Unauthorized
from app.core.security import TokenError, verify_session
from app.models import User
from app.services.container import Container

_bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]


def get_current_user(
    c: ContainerDep, cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User:
    if cred is None:
        raise Unauthorized("Cần đăng nhập (Authorization: Bearer <token>)")
    try:
        claims = verify_session(c.settings.jwt_secret, cred.credentials)
    except TokenError as e:
        raise Unauthorized(f"Phiên đăng nhập không hợp lệ: {e}") from e
    with c.sf() as s:
        user = s.get(User, int(claims["sub"]))
        if user is None or user.wallet_address != claims.get("addr"):
            raise Unauthorized("Tài khoản không tồn tại")
        s.expunge(user)
        return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(c: ContainerDep, x_admin_key: Annotated[str | None, Header()] = None) -> None:
    key = c.settings.admin_api_key
    if not key:
        raise Forbidden("ADMIN_API_KEY chưa được cấu hình")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, key):
        raise Forbidden("Sai admin key (header X-Admin-Key)")
