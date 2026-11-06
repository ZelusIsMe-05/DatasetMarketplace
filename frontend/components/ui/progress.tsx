"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

interface ProgressProps {
  value: number; // 0..1
  label: string;
  className?: string;
  size?: "sm" | "md";
  tone?: "primary" | "success";
}

/** Thanh tiến độ: animate bằng transform scaleX (không reflow), có role=progressbar. */
export function Progress({ value, label, className, size = "md", tone = "primary" }: ProgressProps) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("relative w-full overflow-hidden rounded-full bg-surface-muted", size === "sm" ? "h-1.5" : "h-2.5", className)}
    >
      <motion.div
        className={cn(
          "absolute inset-y-0 left-0 w-full origin-left rounded-full",
          tone === "primary" ? "bg-gradient-to-r from-primary to-cyan" : "bg-gradient-to-r from-success to-[#34d399]",
        )}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: v }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Vòng tiến độ SVG. */
export function ProgressRing({ value, size = 120, stroke = 10, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const gid = `ring${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`; // id hợp lệ cho url(#…)
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}
