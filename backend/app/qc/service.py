"""Nạp model QC một lần cho cả tiến trình và dùng lại (thread-safe)."""
from __future__ import annotations

import logging
import threading
import time

from app.core.config import QcSettings
from app.qc.checker import QualityChecker, Thresholds

log = logging.getLogger("datasetmarketplace.qc")


class QcService:
    def __init__(self, settings: QcSettings):
        self.settings = settings
        self._checker: QualityChecker | None = None
        self._lock = threading.Lock()
        self.load_error: str | None = None
        self.load_seconds: float | None = None

    @property
    def loaded(self) -> bool:
        return self._checker is not None

    def get(self) -> QualityChecker:
        if self._checker is None:
            with self._lock:
                if self._checker is None:
                    t = time.time()
                    log.info("Đang nạp model QC %s (CPU)...", self.settings.model_id)
                    try:
                        self._checker = QualityChecker(
                            self.settings.model_id,
                            num_threads=self.settings.num_threads,
                            th=Thresholds.from_settings(self.settings),
                        )
                    except Exception as e:  # noqa: BLE001
                        self.load_error = f"{type(e).__name__}: {e}"
                        raise
                    self.load_seconds = round(time.time() - t, 1)
                    self.load_error = None
                    log.info("Model QC đã nạp sau %.1fs", self.load_seconds)
        return self._checker
