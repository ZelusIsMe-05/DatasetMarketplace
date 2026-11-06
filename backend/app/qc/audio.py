"""Giải mã audio về 16 kHz mono float32.

Hỗ trợ wav/flac/ogg/mp3 qua soundfile (libsndfile) và webm/opus/m4a (định dạng MediaRecorder
của trình duyệt) qua PyAV. Đề xuất dùng `torchaudio.load`, nhưng trên Windows hàm này cần backend
phụ và không đọc được webm, nên thay bằng hai thư viện trên (xem docs/implementation-plan.md).
"""
from __future__ import annotations

import io

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF

SR = 16_000


class AudioDecodeError(ValueError):
    pass


def _decode_soundfile(data: bytes) -> tuple[np.ndarray, int]:
    wav, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return wav.mean(axis=1), int(sr)


def _decode_av(data: bytes) -> tuple[np.ndarray, int]:
    import av

    try:
        with av.open(io.BytesIO(data)) as container:
            stream = container.streams.audio[0]
            resampler = av.AudioResampler(format="flt", layout="mono", rate=SR)
            chunks: list[np.ndarray] = []
            for frame in container.decode(stream):
                for f in resampler.resample(frame):
                    chunks.append(f.to_ndarray().reshape(-1))
            for f in resampler.resample(None):
                chunks.append(f.to_ndarray().reshape(-1))
    except (av.error.FFmpegError, IndexError) as e:  # type: ignore[attr-defined]
        raise AudioDecodeError("không đọc được file audio") from e
    if not chunks:
        raise AudioDecodeError("file audio rỗng")
    return np.concatenate(chunks).astype(np.float32), SR


def decode_audio(data: bytes) -> np.ndarray:
    """bytes -> mảng float32 mono 16 kHz trong [-1, 1]."""
    if not data:
        raise AudioDecodeError("file audio rỗng")
    try:
        wav, sr = _decode_soundfile(data)
    except (sf.LibsndfileError, RuntimeError, TypeError):
        wav, sr = _decode_av(data)
    if wav.size == 0:
        raise AudioDecodeError("file audio rỗng")
    if sr != SR:
        wav = AF.resample(torch.from_numpy(np.ascontiguousarray(wav)), sr, SR).numpy()
    return np.clip(wav, -1.0, 1.0).astype(np.float32)


def load_audio_file(path: str) -> np.ndarray:
    with open(path, "rb") as f:
        return decode_audio(f.read())


def to_wav_bytes(wav: np.ndarray) -> bytes:
    """Dạng lưu trữ chuẩn (PCM16 16 kHz mono). Commitment được tính trên đúng các byte này."""
    buf = io.BytesIO()
    sf.write(buf, wav, SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def duration_sec(wav: np.ndarray) -> float:
    return len(wav) / SR
