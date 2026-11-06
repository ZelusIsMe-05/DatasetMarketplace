"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Sóng âm sống theo micro thật (AnalyserNode). Vẽ canvas bằng requestAnimationFrame; dừng và dọn khi unmount.
 * prefers-reduced-motion: chỉ hiện một thanh mức âm lượng thay vì sóng chạy.
 */
export function LiveWaveform({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !analyser) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const data = new Uint8Array(analyser.fftSize);
    const bars = 48;
    const history: number[] = Array(bars).fill(0.04);
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 1000 / 30) return; // 30 fps là đủ, nhẹ CPU
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== w * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
      history.push(Math.max(0.04, rms));
      history.shift();

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#2563eb");
      grad.addColorStop(1, "#06b6d4");
      g.fillStyle = grad;
      if (reduce) {
        g.beginPath();
        g.roundRect(0, h / 2 - 6, w * rms, 12, 6);
        g.fill();
        return;
      }
      const gap = 3;
      const bw = (w - gap * (bars - 1)) / bars;
      history.forEach((v, i) => {
        const bh = Math.max(4, v * h);
        g.beginPath();
        g.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
        g.fill();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, reduce]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
