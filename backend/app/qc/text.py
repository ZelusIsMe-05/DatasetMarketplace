"""Chuẩn hóa văn bản và CER (đề xuất §7.7, §10.3)."""
from __future__ import annotations

import re
import unicodedata

import jiwer

_PUNCT = re.compile(r"[^\w\s]", flags=re.UNICODE)
_SPACES = re.compile(r"\s+")
_DIGIT = re.compile(r"\d")


def normalize_text(text: str) -> str:
    """Chuẩn hóa để so sánh: NFC, viết thường, bỏ dấu câu, gộp khoảng trắng.

    Câu mẫu nên viết số bằng chữ ngay từ đầu (§10.2), nên không cần đổi số thành chữ ở đây.
    """
    text = unicodedata.normalize("NFC", text).lower()
    text = _PUNCT.sub(" ", text).replace("_", " ")
    return _SPACES.sub(" ", text).strip()


def char_count(norm_text: str) -> int:
    """Số ký tự (không tính khoảng trắng) — dùng cho tốc độ đọc."""
    return len(norm_text.replace(" ", ""))


def cer(reference: str, hypothesis: str) -> float:
    """Character Error Rate trên văn bản đã chuẩn hóa. Giả thuyết rỗng => CER = 1."""
    ref = normalize_text(reference)
    hyp = normalize_text(hypothesis)
    if not ref:
        raise ValueError("câu tham chiếu rỗng")
    if not hyp:
        return 1.0
    return float(jiwer.cer(ref, hyp))


def has_digits(text: str) -> bool:
    return bool(_DIGIT.search(text))


def canonical_prompt_set(prompts: list[str]) -> str:
    """Dạng chuẩn của bộ câu mẫu để băm on-chain: NFC, mỗi câu một dòng LF, có xuống dòng cuối."""
    lines = [unicodedata.normalize("NFC", p.strip()) for p in prompts]
    if any(not line or "\n" in line for line in lines):
        raise ValueError("câu mẫu rỗng hoặc chứa xuống dòng")
    return "\n".join(lines) + "\n"


def parse_prompt_set(canonical: str) -> list[str]:
    return canonical.rstrip("\n").split("\n")
