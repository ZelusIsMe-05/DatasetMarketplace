"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Tính đỉnh sóng từ chính file audio (không vẽ sóng giả). */
async function computePeaks(blob: Blob, bars: number): Promise<number[]> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const peaks = Array.from({ length: bars }, (_, i) => {
      let m = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(data[j]));
      return m;
    });
    const max = Math.max(...peaks, 0.01);
    return peaks.map((p) => Math.max(0.08, p / max));
  } finally {
    await ctx.close();
  }
}

interface AudioPlayerProps {
  /** URL công khai (mẫu nghe thử) hoặc hàm tải blob (ví dụ cần header admin) */
  src?: string;
  load?: () => Promise<Blob>;
  label: string;
  className?: string;
  bars?: number;
}

export function AudioPlayer({ src, load, label, className, bars = 48 }: AudioPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const blob = load ? await load() : await (await fetch(src!)).blob();
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        revoke = u;
        setUrl(u);
        setPeaks(await computePeaks(blob, bars));
      } catch {
        if (!cancelled) setError("Không tải được audio");
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src, load, bars]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface p-3", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? `Tạm dừng ${label}` : `Phát ${label}`}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0_8px_18px_-8px_rgb(37_99_235/0.7)] transition-transform duration-[var(--duration-micro)] hover:scale-105 active:scale-95 disabled:opacity-40"
      >
        {playing ? (
          <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" className="ml-0.5 size-4" fill="currentColor" aria-hidden><path d="M6 4.5v11a1 1 0 001.5.86l9-5.5a1 1 0 000-1.72l-9-5.5A1 1 0 006 4.5z" /></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-10 cursor-pointer items-center gap-[2px]" onClick={seek} role="presentation">
          {error ? (
            <span className="text-sm text-danger-ink">{error}</span>
          ) : peaks ? (
            peaks.map((p, i) => (
              <span
                key={i}
                className={cn("w-full rounded-full transition-colors duration-150", i / peaks.length < progress ? "bg-primary" : "bg-line-strong")}
                style={{ height: `${p * 100}%` }}
              />
            ))
          ) : (
            <span className="skeleton h-6 w-full" />
          )}
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-muted tabular">
          <span className="truncate">{label}</span>
          <span>{duration ? `${duration.toFixed(1)}s` : ""}</span>
        </div>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        />
      )}
      <motion.span className="sr-only" aria-live="polite">{playing ? "Đang phát" : ""}</motion.span>
    </div>
  );
}
