"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Số chạy mềm khi giá trị thay đổi (tiền, giây, %). Tôn trọng prefers-reduced-motion. */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    if (reduce) {
      prev.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={cn("tabular", className)}>{format(shown)}</span>;
}

/** Xuất hiện khi cuộn tới (một lần, tiết chế). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.52, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
      className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      aria-label={done ? "Đã sao chép" : label}
      title={done ? "Đã sao chép" : label}
    >
      <motion.svg key={done ? "ok" : "copy"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        {done ? <path d="M4 10.5l3.5 3.5L16 6" strokeLinecap="round" strokeLinejoin="round" className="text-success" stroke="currentColor" /> : <><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7" /></>}
      </motion.svg>
    </button>
  );
}

export interface StepDef {
  label: string;
  description?: string;
}

/** Chỉ báo các bước (onboarding, wizard). */
/** align="center": nhãn căn giữa dưới thanh tiến độ của từng bước (dùng ở onboarding /earn). */
export function Stepper({ steps, current, align = "start" }: { steps: StepDef[]; current: number; align?: "start" | "center" }) {
  return (
    <ol className="flex w-full items-start gap-2" aria-label="Các bước">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s.label} className={cn("flex min-w-0 flex-1 flex-col gap-2", align === "center" && "text-center")} aria-current={state === "current" ? "step" : undefined}>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <motion.div
                className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-primary to-cyan"
                initial={false}
                animate={{ scaleX: state === "todo" ? 0 : 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className={cn("truncate text-xs font-semibold sm:text-sm", state === "todo" ? "text-ink-muted" : "text-ink")}>
              <span className="tabular">{i + 1}.</span> {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left" }: { eyebrow?: string; title: ReactNode; description?: ReactNode; align?: "left" | "center" }) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", align === "center" && "mx-auto items-center text-center")}>
      {eyebrow && <span className="text-sm font-semibold text-primary">{eyebrow}</span>}
      <h2 className="text-h2">{title}</h2>
      {description && <p className="text-lead">{description}</p>}
    </div>
  );
}
