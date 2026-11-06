"use client";

import { motion } from "motion/react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { checkPassword } from "@/lib/password";
import { Input } from "@/components/ui/field";

/**
 * Ô mật khẩu có nút "con mắt" hiện/ẩn. Nhận id / aria-* từ <Field> và chuyển thẳng xuống <input>,
 * nên nhãn, gợi ý và thông báo lỗi vẫn được nối đúng cho trình đọc màn hình.
 */
export function PasswordInput({ className, ...rest }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...rest} type={visible ? "text" : "password"} className={cn("pr-12", className)} spellCheck={false} autoCapitalize="none" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={visible}
        aria-controls={rest.id}
        title={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink-muted transition-colors duration-[var(--duration-micro)] hover:bg-surface-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}

const LEVELS = [
  { label: "Rất yếu", bar: "bg-danger", text: "text-danger-ink" },
  { label: "Yếu", bar: "bg-danger", text: "text-danger-ink" },
  { label: "Trung bình", bar: "bg-warning", text: "text-warning-ink" },
  { label: "Khá", bar: "bg-warning", text: "text-warning-ink" },
  { label: "Gần đủ", bar: "bg-cyan", text: "text-cyan-ink" },
  { label: "Mạnh", bar: "bg-success", text: "text-success-ink" },
];

/** Danh sách điều kiện luôn hiển thị, cập nhật theo từng ký tự gõ + thanh độ mạnh. */
export function PasswordRequirements({ password, id }: { password: string; id?: string }) {
  const check = checkPassword(password);
  const level = LEVELS[check.passed];
  return (
    <div id={id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-canvas p-3.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-ink-soft">Độ mạnh mật khẩu</span>
        <span className={cn("font-semibold", password ? level.text : "text-ink-muted")} aria-live="polite">
          {password ? level.label : "Chưa nhập"}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {check.results.map((_, i) => (
          <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <motion.span
              className={cn("absolute inset-0 origin-left rounded-full", level.bar)}
              initial={false}
              animate={{ scaleX: i < check.passed ? 1 : 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        ))}
      </div>
      <ul aria-label="Yêu cầu mật khẩu" className="grid gap-1 text-sm sm:grid-cols-2">
        {check.results.map(({ rule, ok }) => (
          <li key={rule.id} className={cn("flex items-start gap-2 transition-colors duration-[var(--duration-micro)]", ok ? "text-success-ink" : "text-ink-muted")}>
            <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold", ok ? "bg-success text-white" : "border border-line-strong")}>
              {ok ? "✓" : ""}
            </span>
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " — đã đạt" : " — chưa đạt"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
