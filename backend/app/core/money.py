"""Quy đổi giữa đơn vị on-chain (USDC, 6 số thập phân) và VNĐ hiển thị (đề xuất §12.5).

Nguyên tắc: on-chain luôn lưu USDC. VNĐ chỉ là lớp hiển thị và nhập liệu.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.request
from decimal import Decimal

USDC_DECIMALS = 6


def units_to_vnd(units: int, rate: float, decimals: int = USDC_DECIMALS) -> int:
    """Số đơn vị token on-chain -> VNĐ (làm tròn đến đồng)."""
    return round(units / 10**decimals * rate)


def vnd_to_units(vnd: int, rate: float, decimals: int = USDC_DECIMALS) -> int:
    """VNĐ người dùng nhập -> số đơn vị token để ghi on-chain."""
    return round(vnd / rate * 10**decimals)


def format_vnd(vnd: int) -> str:
    """16900000 -> '16.900.000 ₫'"""
    return f"{vnd:,}".replace(",", ".") + " ₫"


def format_token(units: int, decimals: int = USDC_DECIMALS) -> str:
    """650000000 -> '650'; 100000 -> '0.1'"""
    d = Decimal(units) / Decimal(10**decimals)
    s = format(d.normalize(), "f")
    return s


class FxRate:
    """Tỷ giá USDC/VND. Local/Fuji: cố định. Mainnet: lấy qua HTTP, cache 5 phút."""

    def __init__(
        self,
        source: str,
        fixed_rate: float = 26_000,
        url: str | None = None,
        json_key: str = "rate",
        ttl_sec: int = 300,
    ):
        self.source, self.fixed_rate, self.url, self.json_key, self.ttl = source, fixed_rate, url, json_key, ttl_sec
        self._cached: tuple[float, float] | None = None  # (rate, timestamp)
        self._lock = threading.Lock()

    def get(self) -> float:
        if self.source == "fixed":
            return self.fixed_rate
        with self._lock:
            if self._cached and time.time() - self._cached[1] < self.ttl:
                return self._cached[0]
            if not self.url:
                raise RuntimeError("FX_URL chưa được cấu hình")
            with urllib.request.urlopen(self.url, timeout=5) as r:  # noqa: S310 - URL do người vận hành cấu hình
                rate = float(json.load(r)[self.json_key])
            if rate <= 0:
                raise RuntimeError("Tỷ giá không hợp lệ")
            self._cached = (rate, time.time())
            return rate

    @property
    def updated_at(self) -> float | None:
        return self._cached[1] if self._cached else None
