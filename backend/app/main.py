"""FastAPI app Dataset Marketplace.

Chạy:  NETWORK=local uvicorn app.main:app --reload     (Windows: scripts\\start-backend.bat)
Swagger: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from app.api.routes_campaigns import router as campaigns_router
from app.api.routes_contributor import router as contributor_router
from app.api.routes_creator import router as creator_router
from app.api.routes_datasets import demo_router
from app.api.routes_datasets import router as datasets_router
from app.api.routes_public import dev_router
from app.api.routes_public import router as public_router
from app.api.routes_sponsor import router as sponsor_router
from app.core.config import Settings, get_settings
from app.core.errors import install_handlers
from app.core.logging import setup_logging
from app.core.ratelimit import LIMITS, limiter
from app.qc.service import QcService
from app.services.container import Container, build_container

log = logging.getLogger("datasetmarketplace.main")


async def _indexer_loop(c: Container) -> None:
    while True:
        await asyncio.sleep(c.settings.indexer_interval_sec)
        try:
            await asyncio.to_thread(c.indexer.sync)
            # Không có vai trò quản trị (§3 #28): quá hạn chủ chiến dịch chưa duyệt ⇒ tự duyệt; giao dịch ghi nhận lỗi
            # tạm thời ⇒ tự thử lại.
            await asyncio.to_thread(c.review.auto_approve_overdue)
            await asyncio.to_thread(c.review.retry_pending_chain)
        except Exception as e:  # noqa: BLE001 - RPC chập chờn không được làm sập server
            log.warning("vòng nền (indexer / duyệt) lỗi: %s", type(e).__name__)


def create_app(
    settings: Settings | None = None, qc_service: QcService | None = None, container: Container | None = None
) -> FastAPI:
    setup_logging()
    settings = settings or get_settings()
    container = container or build_container(settings, qc_service=qc_service)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        task = None
        if settings.qc.preload:
            await asyncio.to_thread(container.qc.get)
        if settings.indexer_interval_sec > 0:
            task = asyncio.create_task(_indexer_loop(container))
        yield
        if task:
            task.cancel()

    app = FastAPI(
        title="Dataset Marketplace API",
        version="0.1.0",
        description=(
            "Chợ dữ liệu giọng nói tiếng Việt có đồng thuận, chia doanh thu trên Avalanche. "
            f"Mạng hiện tại: **{settings.network.name}** (chain {settings.network.chain_id}). "
            "Mọi số tiền trả về có cả `units` (on-chain) và `vnd`."
        ),
        lifespan=lifespan,
    )
    app.state.container = container
    app.state.settings = settings
    limiter.enabled = settings.rate_limit_enabled
    LIMITS["faucet"] = settings.rate_limit_faucet
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limited(_: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"error": {"code": "rate_limited", "message": "Quá nhiều yêu cầu, hãy thử lại sau",
                               "details": {"limit": str(exc.detail)}}},
        )

    install_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )

    app.include_router(public_router)
    app.include_router(campaigns_router)
    app.include_router(sponsor_router)
    app.include_router(contributor_router)
    app.include_router(datasets_router)
    app.include_router(creator_router)
    if settings.network.allow_faucet_button:
        app.include_router(demo_router)  # mainnet: không mount => 404
    if settings.dev_mode:
        app.include_router(dev_router)  # chỉ NETWORK=local + DEV_AUTH_ENABLED
    return app


def __getattr__(name: str):  # noqa: ANN202 - `uvicorn app.main:app` tạo app lười (không chạy khi import module)
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
