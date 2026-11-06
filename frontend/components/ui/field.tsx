"use client";

import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-[0.9375rem] text-ink placeholder:text-ink-muted/80 " +
  "transition-[border-color,box-shadow] duration-[var(--duration-micro)] hover:border-line-strong " +
  "focus:border-primary focus:outline-none focus:shadow-[var(--shadow-ring)] disabled:bg-surface-muted disabled:text-ink-muted " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgb(220_38_38/0.15)]";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28 py-3 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-11 appearance-none pr-10", className)} {...rest}>
        {children}
      </select>
      <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
  trailing?: ReactNode;
}

/** Nhãn + gợi ý + lỗi, tự nối id/aria cho control con (WCAG 1.3.1, 3.3.1). */
export function Field({ label, hint, error, children, className, trailing }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const child = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label">
          {label}
        </label>
        {trailing}
      </div>
      {child}
      {hint && !error && (
        <p id={hintId} className="text-caption">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
