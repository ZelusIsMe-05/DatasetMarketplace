"""Tỷ giá + định dạng tiền cho API (đề xuất §8.4)."""
from __future__ import annotations

from app.core.config import Settings
from app.core.money import FxRate, format_token, format_vnd, units_to_vnd, vnd_to_units
from app.schemas.common import Money


class FxService:
    def __init__(self, settings: Settings, symbol: str = "USDC"):
        self.settings = settings
        self.symbol = symbol
        self.rate_source = FxRate(
            settings.network.fx_source,
            fixed_rate=settings.usdc_vnd_rate,
            url=settings.fx_url,
            json_key=settings.fx_json_key,
        )

    def rate(self) -> float:
        return self.rate_source.get()

    def money(self, units: int, rate: float | None = None) -> Money:
        r = rate if rate is not None else self.rate()
        vnd = units_to_vnd(int(units), r, self.settings.token_decimals)
        return Money(
            units=int(units),
            vnd=vnd,
            display=f"≈ {format_vnd(vnd)}",
            token=f"{format_token(int(units), self.settings.token_decimals)} {self.symbol} trên Avalanche",
        )

    def vnd_to_units(self, vnd: int) -> tuple[int, float]:
        r = self.rate()
        return vnd_to_units(vnd, r, self.settings.token_decimals), r
