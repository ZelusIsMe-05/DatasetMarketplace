"""Pipeline QC (đề xuất §10.1, §10.3). Chạy CPU, model nạp một lần và dùng lại.

Bước: (1) độ dài → (2) Silero VAD → (3) tốc độ đọc → (4) wav2vec2 CTC → (5) CER từ giải mã tham lam
→ (6) forced alignment với câu mẫu → (7) điểm từng từ → quyết định pass / gray / reject.
Bước chống trùng (§10.1 bước 6) nằm ở ContributionService vì cần database.
"""
from __future__ import annotations

import math
import threading
from dataclasses import asdict, dataclass, field

import numpy as np
import torch
import torchaudio.functional as AF

from app.core.config import QcSettings
from app.qc.audio import SR, duration_sec
from app.qc.text import char_count, cer, normalize_text


@dataclass
class Thresholds:
    min_sec: float = 1.5
    max_sec: float = 15.0
    min_speech_ratio: float = 0.5
    min_chars_per_sec: float = 5.0
    max_chars_per_sec: float = 30.0
    max_cer_pass: float = 0.15  # dưới mức này: đạt
    max_cer_gray: float = 0.30  # giữa hai mức: vùng xám, duyệt tay
    min_align_pass: float = 0.60  # điểm alignment trung bình
    min_align_gray: float = 0.40
    min_word_score: float = 0.20  # một từ quá thấp => nghi bỏ từ / đọc sai

    @classmethod
    def from_settings(cls, qc: QcSettings) -> Thresholds:
        return cls(**{k: getattr(qc, k) for k in cls.__dataclass_fields__})


@dataclass
class QCResult:
    decision: str  # "pass" | "gray" | "reject"
    reasons: list[str] = field(default_factory=list)
    duration_sec: float = 0.0
    speech_sec: float = 0.0
    chars_per_sec: float | None = None
    cer: float | None = None
    align_score: float | None = None
    word_scores: list[tuple[str, float]] = field(default_factory=list)
    hypothesis: str = ""
    oov_chars: list[str] = field(default_factory=list)
    step: str = ""  # bước dừng lại (để chẩn đoán)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["word_scores"] = [{"word": w, "score": round(s, 4)} for w, s in self.word_scores]
        for k in ("duration_sec", "speech_sec", "chars_per_sec", "cer", "align_score"):
            if d[k] is not None:
                d[k] = round(float(d[k]), 4)
        return d


# ------------------------------------------------------------------ các bước thuần (dễ unit test)


def check_duration(dur: float, th: Thresholds) -> str | None:
    if not th.min_sec <= dur <= th.max_sec:
        return f"độ dài {dur:.1f}s ngoài khoảng cho phép ({th.min_sec:g}–{th.max_sec:g}s)"
    return None


def check_speech_ratio(speech: float, dur: float, th: Thresholds) -> str | None:
    if dur <= 0 or speech / dur < th.min_speech_ratio:
        return "quá ít giọng nói (im lặng hoặc tạp âm)"
    return None


def reading_rate(norm_prompt: str, speech: float) -> float:
    return char_count(norm_prompt) / max(speech, 1e-6)


def check_reading_rate(cps: float, th: Thresholds) -> str | None:
    if not th.min_chars_per_sec <= cps <= th.max_chars_per_sec:
        return f"tốc độ đọc bất thường ({cps:.1f} ký tự/giây)"
    return None


def ctc_feasible(target_ids: list[int], num_frames: int) -> bool:
    """CTC cần T >= L + số cặp token lặp liên tiếp (phải chèn blank giữa chúng)."""
    repeats = sum(1 for a, b in zip(target_ids, target_ids[1:]) if a == b)
    return 0 < len(target_ids) and len(target_ids) + repeats <= num_frames


def decide(res: QCResult, th: Thresholds) -> QCResult:
    weak = [w for w, sc in res.word_scores if sc < th.min_word_score]
    assert res.cer is not None and res.align_score is not None
    if res.cer <= th.max_cer_pass and res.align_score >= th.min_align_pass and not weak and not res.oov_chars:
        res.decision = "pass"
    elif res.cer <= th.max_cer_gray and res.align_score >= th.min_align_gray:
        res.decision = "gray"
        if weak:
            res.reasons.append(f"từ đáng ngờ: {weak}")
        if res.oov_chars:
            res.reasons.append("câu mẫu có ký tự ngoài vocab, cần duyệt tay")
        if not weak and not res.oov_chars:
            res.reasons.append(f"chất lượng ở vùng xám (CER={res.cer:.2f}, align={res.align_score:.2f})")
    else:
        res.decision = "reject"
        res.reasons.append(f"không khớp câu mẫu (CER={res.cer:.2f}, align={res.align_score:.2f})")
    return res


def weight_seconds(res: QCResult, source: str) -> int:
    """Trọng số on-chain = số giây hợp lệ, làm tròn xuống (§6.4)."""
    value = res.speech_sec if source == "speech" else res.duration_sec
    return int(math.floor(value))


# ------------------------------------------------------------------ checker có model


class QualityChecker:
    def __init__(self, model_id: str, num_threads: int = 2, th: Thresholds | None = None):
        from silero_vad import load_silero_vad
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        torch.set_num_threads(num_threads)
        self.model_id = model_id
        self.th = th or Thresholds()
        self.processor = Wav2Vec2Processor.from_pretrained(model_id)
        self.model = Wav2Vec2ForCTC.from_pretrained(model_id).eval()
        self.vad = load_silero_vad()
        tok = self.processor.tokenizer
        self.vocab: dict[str, int] = tok.get_vocab()
        self.blank_id: int = tok.pad_token_id
        self.delim: str = tok.word_delimiter_token  # "|"
        self._lock = threading.Lock()  # model PyTorch + VAD có trạng thái: chấm tuần tự

    def oov_chars(self, prompt: str) -> list[str]:
        norm = normalize_text(prompt)
        return sorted({ch for ch in norm.replace(" ", "") if ch not in self.vocab})

    def _targets(self, norm_prompt: str) -> tuple[list[int], list[int], list[str]]:
        """(token ids, chỉ số từ của mỗi token (-1 = phân cách), ký tự ngoài vocab)."""
        ids: list[int] = []
        word_idx: list[int] = []
        oov: list[str] = []
        words = norm_prompt.split(" ")
        for wi, word in enumerate(words):
            if wi > 0 and self.delim in self.vocab:
                ids.append(self.vocab[self.delim])
                word_idx.append(-1)
            for ch in word:
                if ch in self.vocab:
                    ids.append(self.vocab[ch])
                    word_idx.append(wi)
                else:
                    oov.append(ch)
        return ids, word_idx, oov

    def speech_seconds(self, wav: np.ndarray) -> float:
        from silero_vad import get_speech_timestamps

        stamps = get_speech_timestamps(torch.from_numpy(wav), self.vad, sampling_rate=SR)
        return sum(s["end"] - s["start"] for s in stamps) / SR

    @torch.inference_mode()
    def check(self, wav: np.ndarray, prompt: str) -> QCResult:
        with self._lock:
            return self._check(wav, prompt)

    def _check(self, wav: np.ndarray, prompt: str) -> QCResult:
        th = self.th
        res = QCResult(decision="reject", duration_sec=duration_sec(wav))

        # 1) Độ dài
        res.step = "duration"
        if reason := check_duration(res.duration_sec, th):
            res.reasons.append(reason)
            return res

        # 2) VAD
        res.step = "vad"
        res.speech_sec = self.speech_seconds(wav)
        if reason := check_speech_ratio(res.speech_sec, res.duration_sec, th):
            res.reasons.append(reason)
            return res

        # 3) Tốc độ đọc
        res.step = "rate"
        norm_prompt = normalize_text(prompt)
        res.chars_per_sec = reading_rate(norm_prompt, res.speech_sec)
        if reason := check_reading_rate(res.chars_per_sec, th):
            res.reasons.append(reason)
            return res

        # 4) Emission CTC
        res.step = "ctc"
        inputs = self.processor(wav, sampling_rate=SR, return_tensors="pt")
        log_probs = torch.log_softmax(self.model(inputs.input_values).logits, dim=-1)  # (1, T, C)

        # 5) CER từ giải mã tham lam (cũng dùng để hiển thị cho người dùng)
        res.step = "cer"
        pred_ids = log_probs.argmax(dim=-1)
        res.hypothesis = self.processor.batch_decode(pred_ids)[0]
        res.cer = cer(norm_prompt, res.hypothesis)

        # 6) Forced alignment với đúng câu mẫu
        res.step = "align"
        target_ids, word_idx, oov = self._targets(norm_prompt)
        res.oov_chars = sorted(set(oov))
        if oov:
            res.reasons.append(f"câu mẫu có ký tự ngoài vocab: {res.oov_chars}")
        if not ctc_feasible(target_ids, log_probs.shape[1]):
            res.reasons.append("audio quá ngắn so với câu mẫu")
            return res
        targets = torch.tensor([target_ids], dtype=torch.int32)
        aligned, scores = AF.forced_align(log_probs.float(), targets, blank=self.blank_id)
        spans = AF.merge_tokens(aligned[0], scores[0].exp(), blank=self.blank_id)
        if len(spans) != len(target_ids):  # không xảy ra với alignment hợp lệ; phòng thủ
            res.reasons.append("không căn chỉnh được với câu mẫu")
            return res
        res.align_score = float(sum(s.score for s in spans) / len(spans))

        # 7) Điểm từng từ: trung bình điểm các ký tự thuộc từ đó
        words = norm_prompt.split(" ")
        per_word: dict[int, list[float]] = {}
        for span, wi in zip(spans, word_idx):
            if wi >= 0:
                per_word.setdefault(wi, []).append(float(span.score))
        res.word_scores = [(words[i], sum(v) / len(v)) for i, v in sorted(per_word.items())]

        res.step = "decision"
        return decide(res, th)
