r"""Sinh audio fixture tiếng Việt THẬT (giọng đọc neural edge-tts) cho test tích hợp QC và demo CLI.

Chạy: .venv\Scripts\python -m scripts.make_fixtures   (cần Internet; chỉ gửi các câu mẫu demo công khai)
Kết quả: tests/fixtures/audio/*.wav (16 kHz mono PCM16) + manifest.json
"""
from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path

import av
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "audio"
PROMPTS = (ROOT.parent / "seed" / "demo-campaign" / "prompts.txt").read_text(encoding="utf-8").splitlines()
VOICES = ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]


def mp3_to_wav16k(data: bytes) -> np.ndarray:
    with av.open(io.BytesIO(data)) as c:
        rs = av.AudioResampler(format="s16", layout="mono", rate=16000)
        chunks = []
        for frame in c.decode(audio=0):
            for f in rs.resample(frame):
                chunks.append(f.to_ndarray().reshape(-1))
        for f in rs.resample(None):
            chunks.append(f.to_ndarray().reshape(-1))
    return np.concatenate(chunks)


async def tts(text: str, voice: str) -> np.ndarray:
    import edge_tts

    buf = bytearray()
    for attempt in range(5):  # dịch vụ TTS đôi khi trả rỗng tạm thời
        try:
            buf = bytearray()
            async for chunk in edge_tts.Communicate(text, voice).stream():
                if chunk["type"] == "audio":
                    buf.extend(chunk["data"])
            break
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(f"TTS thất bại cho giọng {voice}")
    pcm = mp3_to_wav16k(bytes(buf))
    pad = np.zeros(int(0.3 * 16000), dtype=np.int16)  # khoảng lặng ngắn đầu/cuối như ghi âm thật
    return np.concatenate([pad, pcm, pad])


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for i in range(8):
        voice = VOICES[i % 2]
        name = f"prompt{i:02d}_{voice.split('-')[2].replace('Neural', '').lower()}.wav"
        manifest.append({"file": name, "prompt_index": i, "text": PROMPTS[i], "voice": voice, "kind": "correct"})
        if (OUT / name).exists():
            continue
        pcm = await tts(PROMPTS[i], voice)
        sf.write(OUT / name, pcm, 16000, subtype="PCM_16")
        print("ok", name, round(len(pcm) / 16000, 2), "s")
    rng = np.random.default_rng(0)
    silence = (rng.normal(0, 30, 16000 * 4)).astype(np.int16)  # 4 s gần như im lặng (tạp âm nền nhỏ)
    sf.write(OUT / "silence_4s.wav", silence, 16000, subtype="PCM_16")
    manifest.append({"file": "silence_4s.wav", "kind": "silence"})
    first, _ = sf.read(OUT / manifest[0]["file"], dtype="int16")
    short = first[int(16000 * 0.3) : int(16000 * 1.3)]  # 1 giây đầu có giọng nói
    sf.write(OUT / "too_short_1s.wav", short, 16000, subtype="PCM_16")
    manifest.append({"file": "too_short_1s.wav", "kind": "too_short"})
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
