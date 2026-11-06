"""Kho audio riêng tư trên đĩa. Audio không bao giờ lên chain và không bao giờ được log."""
from __future__ import annotations

import os
import uuid
from pathlib import Path


class PrivateStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        (self.root / "audio").mkdir(parents=True, exist_ok=True)

    def _abs(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if self.root not in p.parents:
            raise ValueError("đường dẫn ngoài kho lưu trữ")
        return p

    def save_audio(self, campaign_id: int, data: bytes) -> str:
        rel = f"audio/{campaign_id}/{uuid.uuid4().hex}.wav"
        p = self._abs(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)
        return rel

    def read(self, rel: str) -> bytes:
        return self._abs(rel).read_bytes()

    def exists(self, rel: str | None) -> bool:
        return bool(rel) and self._abs(rel).exists()

    def delete(self, rel: str | None) -> bool:
        """Xóa thật file audio (dùng khi thu hồi / bị loại)."""
        if not rel:
            return False
        p = self._abs(rel)
        if p.exists():
            p.unlink()
            return True
        return False
