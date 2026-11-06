from __future__ import annotations

import json
from functools import cache
from pathlib import Path

_DIR = Path(__file__).resolve().parent / "abi"


@cache
def load_abi(name: str) -> list[dict]:
    path = _DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Không thấy ABI {path}. Chạy: forge build && python -m scripts.export_abi")
    return json.loads(path.read_text(encoding="utf-8"))
