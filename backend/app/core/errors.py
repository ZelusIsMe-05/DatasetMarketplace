"""Lỗi nghiệp vụ có mã HTTP rõ ràng. Thông báo bằng tiếng Việt, an toàn để trả cho client."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("datasetmarketplace.errors")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, details: dict | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details or {}


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class Gone(AppError):
    status_code = 410
    code = "gone"


class PayloadTooLarge(AppError):
    status_code = 413
    code = "payload_too_large"


class ServiceUnavailable(AppError):
    status_code = 503
    code = "service_unavailable"


class ChainError(AppError):
    """Giao dịch/đọc contract thất bại (revert có tên lỗi đã giải mã)."""

    status_code = 502
    code = "chain_error"


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # Không trả stack trace cho client; log tên lỗi + đường dẫn (không log body/audio).
        log.exception("Unhandled error on %s %s: %s", request.method, request.url.path, type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Lỗi máy chủ", "details": {}}},
        )
