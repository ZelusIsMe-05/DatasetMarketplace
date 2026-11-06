// Ghi âm TRỰC TIẾP trên trình duyệt (đề xuất §6.4: không cho upload file) → WAV PCM16 16 kHz mono,
// đúng định dạng lưu trữ chuẩn của backend (commitment tính trên WAV chuẩn hóa phía server).
export const TARGET_RATE = 16_000;

export interface LiveSession {
  analyser: AnalyserNode;
  sampleRate: number;
  stop: () => Promise<{ wav: Blob; durationSec: number }>;
  /** Hủy, không trả bản ghi (rời trang, lỗi) — luôn tắt micro. */
  abort: () => void;
  /** Bỏ phần âm thanh trước đó (ví dụ lúc đếm ngược) — bản ghi bắt đầu từ đây. */
  reset: () => void;
}

export class MicrophoneError extends Error {
  constructor(public kind: "denied" | "unavailable" | "unsupported", message: string) {
    super(message);
  }
}

export async function startLiveCapture(): Promise<LiveSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError("unsupported", "Trình duyệt không hỗ trợ ghi âm");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicrophoneError("denied", "Bạn chưa cho phép dùng micro");
    throw new MicrophoneError("unavailable", "Không tìm thấy micro trên thiết bị");
  }
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const chunks: Float32Array[] = [];
  let teardown: () => void;
  try {
    await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => chunks.push(e.data);
    source.connect(node);
    teardown = () => {
      node.port.onmessage = null;
      node.disconnect();
    };
  } catch {
    // Dự phòng cho trình duyệt cũ chưa có AudioWorklet
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(ctx.destination);
    teardown = () => {
      proc.onaudioprocess = null;
      proc.disconnect();
    };
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    teardown();
    source.disconnect();
    analyser.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    analyser,
    sampleRate: ctx.sampleRate,
    abort: close,
    reset: () => {
      chunks.length = 0;
    },
    stop: async () => {
      const rate = ctx.sampleRate;
      close();
      const samples = resample(concat(chunks), rate, TARGET_RATE);
      return { wav: encodeWav(samples, TARGET_RATE), durationSec: samples.length / TARGET_RATE };
    },
  };
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    // trung bình cửa sổ (chống răng cưa đơn giản) khi hạ tần số lấy mẫu
    const start = Math.floor(i * ratio);
    const end = Math.min(x.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += x[j];
    out[i] = end > start ? sum / (end - start) : x[start] ?? 0;
  }
  return out;
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}
