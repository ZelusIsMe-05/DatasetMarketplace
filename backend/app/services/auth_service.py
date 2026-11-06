"""Đăng nhập: Google OAuth (ID token) + chứng minh sở hữu ví bằng chữ ký; mỗi email đúng một ví (§8.2).

Cơ chế dev (`login_dev`) chỉ hoạt động khi NETWORK=local và DEV_AUTH_ENABLED=true; router của nó
không được mount ở môi trường khác (xem app/main.py).
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session, sessionmaker
from web3 import Web3

from app.blockchain.eip712 import recover_text
from app.core.config import Settings
from app.core.errors import BadRequest, Conflict, Forbidden, ServiceUnavailable, Unauthorized
from app.core.security import issue_session
from app.models import AuthChallenge, User
from app.repositories.queries import UserRepo
from app.schemas.auth import ChallengeResponse, SessionResponse

CHALLENGE_TTL = timedelta(minutes=5)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class AuthService:
    def __init__(self, settings: Settings, session_factory: sessionmaker[Session]):
        self.settings = settings
        self.sf = session_factory

    def challenge(self, address: str, purpose: str = "login") -> ChallengeResponse:
        if not Web3.is_address(address):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        addr = Web3.to_checksum_address(address)
        nonce = secrets.token_hex(16)
        exp = datetime.now(UTC) + CHALLENGE_TTL
        net = self.settings.network
        message = (
            "Dataset Marketplace – xác minh sở hữu ví\n"
            f"Mục đích: {purpose}\n"
            f"Ví: {addr}\n"
            f"Mạng: {net.name} (chain {net.chain_id})\n"
            f"Nonce: {nonce}\n"
            f"Hết hạn: {exp.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        )
        with self.sf() as s:
            s.add(AuthChallenge(nonce=nonce, address=addr, purpose=purpose, message=message, expires_at=exp))
            s.commit()
        return ChallengeResponse(address=addr, nonce=nonce, message=message, expires_at=int(exp.timestamp()))

    def _consume_challenge(self, s: Session, address: str, nonce: str, signature: str) -> str:
        if not Web3.is_address(address):
            raise BadRequest("Địa chỉ ví không hợp lệ")
        addr = Web3.to_checksum_address(address)
        ch = s.get(AuthChallenge, nonce)
        if ch is None or ch.address != addr or ch.purpose != "login":
            raise Unauthorized("Challenge không tồn tại")
        if ch.used_at is not None:
            raise Unauthorized("Challenge đã được dùng")
        if _as_utc(ch.expires_at) < datetime.now(UTC):
            raise Unauthorized("Challenge đã hết hạn")
        try:
            signer = recover_text(ch.message, signature)
        except Exception as e:  # noqa: BLE001
            raise Unauthorized("Chữ ký không hợp lệ") from e
        if signer != addr:
            raise Unauthorized("Chữ ký không khớp ví")
        ch.used_at = datetime.now(UTC)
        return addr

    def _bind(self, s: Session, email: str, address: str, provider: str, google_sub: str | None) -> User:
        email = email.strip().lower()
        user = UserRepo.by_email(s, email)
        other = UserRepo.by_wallet(s, address)
        if user is None:
            if other is not None:
                raise Conflict("Ví này đã gắn với một email khác", code="wallet_taken")
            user = User(email=email, wallet_address=address, auth_provider=provider, google_sub=google_sub)
            s.add(user)
            s.flush()
        elif user.wallet_address != address:
            raise Conflict("Email này đã gắn với một ví khác (mỗi email một ví)", code="email_bound")
        return user

    def _session(self, user: User) -> SessionResponse:
        token, exp = issue_session(
            self.settings.jwt_secret, user.id, user.email, user.wallet_address, self.settings.session_ttl_sec
        )
        return SessionResponse(
            access_token=token, expires_at=exp, user_id=user.id, email=user.email, wallet_address=user.wallet_address
        )

    def login_google(self, id_token_str: str, address: str, nonce: str, signature: str) -> SessionResponse:
        if not self.settings.google_client_id:
            raise ServiceUnavailable("Google OAuth chưa được cấu hình (GOOGLE_CLIENT_ID)")
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        try:
            info = id_token.verify_oauth2_token(
                id_token_str, google_requests.Request(), self.settings.google_client_id
            )
        except ValueError as e:
            raise Unauthorized("Google ID token không hợp lệ") from e
        if not info.get("email") or not info.get("email_verified"):
            raise Unauthorized("Email Google chưa được xác minh")
        with self.sf() as s:
            addr = self._consume_challenge(s, address, nonce, signature)
            user = self._bind(s, info["email"], addr, "google", info.get("sub"))
            s.commit()
            return self._session(user)

    def login_dev(self, email: str, address: str, nonce: str, signature: str) -> SessionResponse:
        if not self.settings.dev_mode:  # phòng thủ thêm: router dev vốn không được mount ngoài local
            raise Forbidden("Đăng nhập dev chỉ dùng được khi NETWORK=local")
        if "@" not in email:
            raise BadRequest("Email không hợp lệ")
        with self.sf() as s:
            addr = self._consume_challenge(s, address, nonce, signature)
            user = self._bind(s, email, addr, "dev", None)
            s.commit()
            return self._session(user)
