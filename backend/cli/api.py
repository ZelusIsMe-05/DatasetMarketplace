"""HTTP client gọi backend; lỗi API được chuyển thành ApiError có thông báo tiếng Việt."""
from __future__ import annotations

from typing import Any

import httpx


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(f"[{status} {code}] {message}")
        self.status, self.code, self.message, self.details = status, code, message, details or {}


class Api:
    def __init__(self, base_url: str, token: str | None = None, admin_key: str | None = None, timeout: float = 180):
        self.base = base_url.rstrip("/")
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if admin_key:
            headers["X-Admin-Key"] = admin_key
        self.http = httpx.Client(base_url=self.base, headers=headers, timeout=timeout)

    def _handle(self, r: httpx.Response) -> Any:
        if r.status_code >= 400:
            try:
                body = r.json()
            except ValueError:
                raise ApiError(r.status_code, "error", r.text[:300]) from None
            err = body.get("error") if isinstance(body, dict) else None
            if isinstance(err, dict):
                raise ApiError(r.status_code, err.get("code", "error"), err.get("message", r.text), err.get("details"))
            detail = (body.get("detail") if isinstance(body, dict) else None) or err or body
            raise ApiError(r.status_code, "error", str(detail)[:500])
        ctype = r.headers.get("content-type", "")
        return r.json() if ctype.startswith("application/json") else r.content

    def get(self, path: str, **params: Any) -> Any:
        try:
            return self._handle(self.http.get(path, params={k: v for k, v in params.items() if v is not None}))
        except httpx.ConnectError as e:
            raise ApiError(0, "connect", f"Không kết nối được backend {self.base} (đã chạy scripts\\start-backend.bat?)") from e

    def post(self, path: str, json: Any = None, files: Any = None, data: Any = None) -> Any:
        try:
            return self._handle(self.http.post(path, json=json, files=files, data=data))
        except httpx.ConnectError as e:
            raise ApiError(0, "connect", f"Không kết nối được backend {self.base}") from e

    def get_url(self, url: str) -> httpx.Response:
        r = self.http.get(url)
        if r.status_code >= 400:
            self._handle(r)
        return r
