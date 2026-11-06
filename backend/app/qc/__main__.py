"""Chạy QC độc lập bằng CMD:

    python -m app.qc <file_audio> "<câu mẫu>" [--json]

Ví dụ:
    python -m app.qc tests\\fixtures\\audio\\prompt00_hoaimy.wav "tôi muốn mở một tài khoản tiết kiệm có kỳ hạn sáu tháng"
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from app.core.config import QcSettings
from app.qc.audio import load_audio_file
from app.qc.checker import weight_seconds
from app.qc.service import QcService


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="python -m app.qc", description="Kiểm tra chất lượng một bản ghi giọng nói")
    ap.add_argument("audio", help="đường dẫn file audio (wav/flac/ogg/mp3/webm)")
    ap.add_argument("prompt", help="câu mẫu người dùng phải đọc")
    ap.add_argument("--json", action="store_true", help="in kết quả dạng JSON")
    ap.add_argument("--model", default=QcSettings().model_id)
    args = ap.parse_args(argv)

    svc = QcService(QcSettings(model_id=args.model))
    t0 = time.time()
    checker = svc.get()
    t1 = time.time()
    res = checker.check(load_audio_file(args.audio), args.prompt)
    t2 = time.time()
    out = res.to_dict() | {
        "weight_sec": weight_seconds(res, "speech"),
        "model_load_sec": round(t1 - t0, 2),
        "inference_sec": round(t2 - t1, 2),
    }
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"Quyết định : {res.decision.upper()}")
        print(f"Lý do      : {'; '.join(res.reasons) or '-'}")
        print(f"Thời lượng : {res.duration_sec:.2f}s (giọng nói {res.speech_sec:.2f}s) → trọng số {out['weight_sec']} giây")
        if res.cer is not None:
            print(f"CER        : {res.cer:.3f}")
        if res.align_score is not None:
            print(f"Alignment  : {res.align_score:.3f}")
        print(f"Máy nghe   : {res.hypothesis!r}")
        if res.word_scores:
            print("Điểm từng từ: " + ", ".join(f"{w}={s:.2f}" for w, s in res.word_scores))
        print(f"(nạp model {out['model_load_sec']}s, chấm {out['inference_sec']}s)")
    return 0 if res.decision != "reject" else 2


if __name__ == "__main__":
    raise SystemExit(main())
