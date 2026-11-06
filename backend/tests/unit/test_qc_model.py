"""QC với model THẬT (wav2vec2 tiếng Việt + Silero VAD) trên audio tiếng Việt thật (tests/fixtures/audio).

Lần chạy đầu tải model (~380 MB) từ Hugging Face. Không có giả lập kết quả inference.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import av
import numpy as np
import pytest

from app.core.config import QcSettings
from app.qc.audio import decode_audio, load_audio_file
from app.qc.service import QcService

pytestmark = pytest.mark.qc
FIX = Path(__file__).resolve().parents[1] / "fixtures" / "audio"
MANIFEST = {m["file"]: m for m in json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))}


@pytest.fixture(scope="session")
def checker():
    return QcService(QcSettings()).get()


@pytest.mark.parametrize("name", [n for n, m in MANIFEST.items() if m["kind"] == "correct"])
def test_correct_reading_passes(checker, name):
    m = MANIFEST[name]
    r = checker.check(load_audio_file(str(FIX / name)), m["text"])
    assert r.decision == "pass", r.reasons
    assert r.cer is not None and r.cer <= 0.15
    assert r.align_score is not None and r.align_score >= 0.6
    assert len(r.word_scores) == len(m["text"].split())


def test_wrong_sentence_rejected(checker):
    wav = load_audio_file(str(FIX / "prompt02_hoaimy.wav"))
    r = checker.check(wav, MANIFEST["prompt00_hoaimy.wav"]["text"])
    assert r.decision == "reject"
    assert r.cer > 0.3


def test_partial_reading_not_passed(checker):
    """Bỏ nửa sau câu (cắt audio) => không được 'pass'."""
    wav = load_audio_file(str(FIX / "prompt04_hoaimy.wav"))
    r = checker.check(wav[: len(wav) // 2], MANIFEST["prompt04_hoaimy.wav"]["text"])
    assert r.decision != "pass"


def test_silence_rejected_by_vad(checker):
    r = checker.check(load_audio_file(str(FIX / "silence_4s.wav")), "tôi muốn mở một tài khoản tiết kiệm")
    assert r.decision == "reject" and r.step == "vad"


def test_too_short_rejected(checker):
    r = checker.check(load_audio_file(str(FIX / "too_short_1s.wav")), "tôi muốn mở một tài khoản tiết kiệm")
    assert r.decision == "reject" and r.step == "duration"


def test_browser_webm_opus_decodes_and_passes(checker):
    """MediaRecorder của trình duyệt gửi webm/opus 48 kHz: giải mã qua PyAV rồi QC như thường."""
    wav16 = load_audio_file(str(FIX / "prompt01_namminh.wav"))
    buf = io.BytesIO()
    with av.open(buf, "w", format="webm") as out:
        st = out.add_stream("libopus", rate=48000)
        st.layout = "mono"
        x = np.interp(np.arange(0, len(wav16) * 3) / 3, np.arange(len(wav16)), wav16).astype(np.float32)
        frame = av.AudioFrame.from_ndarray(x.reshape(1, -1), format="flt", layout="mono")
        frame.sample_rate = 48000
        for p in st.encode(frame):
            out.mux(p)
        for p in st.encode(None):
            out.mux(p)
    decoded = decode_audio(buf.getvalue())
    assert abs(len(decoded) / 16000 - len(wav16) / 16000) < 0.2
    r = checker.check(decoded, MANIFEST["prompt01_namminh.wav"]["text"])
    assert r.decision == "pass", r.reasons
