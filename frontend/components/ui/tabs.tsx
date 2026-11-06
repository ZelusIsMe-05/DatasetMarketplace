"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}

/** Tabs theo mẫu WAI-ARIA (role=tablist, phím ←/→/Home/End), chỉ báo trượt bằng layoutId. */
export function Tabs<T extends string>({ items, value, onChange, label, className }: TabsProps<T>) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1", className)}>
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors duration-[var(--duration-micro)]",
              active ? "text-primary-active" : "text-ink-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span layoutId={`tab-${group}`} className="absolute inset-0 rounded-xl bg-primary-soft" transition={{ type: "spring", bounce: 0.15, duration: 0.4 }} />
            )}
            <span className="relative">{it.label}</span>
            {it.count !== undefined && (
              <span className={cn("relative rounded-full px-1.5 text-xs tabular", active ? "bg-white text-primary-active" : "bg-surface-muted")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
