"""Health, tỷ giá, đăng nhập."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.api.deps import ContainerDep, CurrentUser
from app.core import ratelimit
from app.core.ratelimit import limiter
from app.schemas.auth import ChallengeResponse, DevLoginRequest, GoogleLoginRequest, MeResponse, SessionResponse

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    network: str
    chain_id: int
    rpc_ok: bool
    block: int | None
    voice_campaigns: str
    token: str
    relayer: str
    relayer_balance_avax: float | None
    db_ok: bool
    database: str  # "postgresql" (vd. Neon) hoặc "sqlite"
    qc_model_loaded: bool
    qc_load_error: str | None
    dev_mode: bool
    data_dir: str


class FxResponse(BaseModel):
    rate: float
    source: str
    pair: str
    network: str
    updated_at: float | None


@router.get("/health", tags=["system"])
def health(c: ContainerDep) -> HealthResponse:
    block, rpc_ok, bal = None, True, None
    try:
        block = c.chain.block_number()
        bal = c.relayer.balance_wei() / 1e18
    except Exception:  # noqa: BLE001
        rpc_ok = False
    db_ok = True
    try:
        with c.engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
    except Exception:  # noqa: BLE001
        db_ok = False
    return HealthResponse(
        status="ok" if rpc_ok and db_ok else "degraded",
        network=c.settings.network.name,
        chain_id=c.settings.network.chain_id,
        rpc_ok=rpc_ok,
        block=block,
        voice_campaigns=c.chain.address,
        token=c.chain.token_address,
        relayer=c.relayer.address,
        relayer_balance_avax=bal,
        db_ok=db_ok,
        database=c.engine.dialect.name,
        qc_model_loaded=c.qc.loaded,
        qc_load_error=c.qc.load_error,
        dev_mode=c.settings.dev_mode,
        data_dir=str(c.data_dir),
    )


@router.get("/fx", tags=["system"])
def fx(c: ContainerDep) -> FxResponse:
    return FxResponse(
        rate=c.fx.rate(),
        source=c.settings.network.fx_source,
        pair="USDC/VND",
        network=c.settings.network.name,
        updated_at=c.fx.rate_source.updated_at,
    )


@router.get("/auth/challenge", tags=["auth"])
@limiter.limit(ratelimit.AUTH)
def auth_challenge(request: Request, c: ContainerDep, address: Annotated[str, Query()]) -> ChallengeResponse:
    return c.auth.challenge(address)


@router.post("/auth/google", tags=["auth"])
@limiter.limit(ratelimit.AUTH)
def auth_google(request: Request, c: ContainerDep, body: GoogleLoginRequest) -> SessionResponse:
    """Đăng nhập Google, gắn email với một địa chỉ ví (mỗi email một ví)."""
    return c.auth.login_google(body.id_token, body.address, body.nonce, body.signature)


@router.get("/auth/me", tags=["auth"])
def auth_me(user: CurrentUser) -> MeResponse:
    return MeResponse(
        user_id=user.id, email=user.email, wallet_address=user.wallet_address, auth_provider=user.auth_provider
    )


dev_router = APIRouter(tags=["dev (chỉ local)"])


@dev_router.post("/auth/dev-login")
@limiter.limit(ratelimit.AUTH)
def auth_dev_login(request: Request, c: ContainerDep, body: DevLoginRequest) -> SessionResponse:
    """[CHỈ NETWORK=local + DEV_AUTH_ENABLED] Đăng nhập không cần Google, vẫn phải ký chứng minh ví."""
    return c.auth.login_dev(body.email, body.address, body.nonce, body.signature)
