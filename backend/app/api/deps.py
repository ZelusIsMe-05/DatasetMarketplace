from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import Unauthorized
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
            raise Unauthorized("Phiên đăng nhập không còn hợp lệ (dữ liệu máy chủ đã được làm mới) — hãy đăng nhập lại")
        s.expunge(user)
        return user


CurrentUser = Annotated[User, Depends(get_current_user)]
