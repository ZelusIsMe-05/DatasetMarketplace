"""Logging an toàn: không bao giờ ghi audio, salt hay khóa riêng (đề xuất §11 "Bảo mật tối thiểu")."""
from __future__ import annotations

import logging
import re

_SENSITIVE = re.compile(
    r"(?i)(salt|private[_-]?key|secret|authorization|password)([\"'=:\s]+)(0x)?[A-Za-z0-9+/_\-.]{16,}"
)
_HEX64 = re.compile(r"\b0x[0-9a-fA-F]{64}\b")


class RedactFilter(logging.Filter):
    """Che giá trị nhạy cảm còn sót trong log (lớp phòng thủ thứ hai)."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:  # noqa: BLE001
            return True
        red = _SENSITIVE.sub(lambda m: f"{m.group(1)}{m.group(2)}***", msg)
        # Chuỗi hex 32 byte có thể là salt hoặc private key: chỉ giữ 6 ký tự đầu.
        red = _HEX64.sub(lambda m: m.group(0)[:8] + "…", red)
        if red != msg:
            record.msg, record.args = red, ()
        return True


def setup_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not any(isinstance(f, RedactFilter) for h in root.handlers for f in h.filters):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
        handler.addFilter(RedactFilter())
        root.addHandler(handler)
    root.setLevel(level)
    for noisy in ("web3", "urllib3", "httpx", "httpcore", "filelock", "huggingface_hub"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
