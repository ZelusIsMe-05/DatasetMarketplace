"use client";

import { AnimatePresence, motion } from "motion/react";
import { txUrl } from "@/lib/config";
import { cn } from "@/lib/cn";
import { shortHex } from "@/lib/format";
import type { TxPhase } from "@/hooks/useContractTx";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "@/components/ui/misc";

export type StepPhase = TxPhase | "waiting";

export interface TxStepView {
  label: string;
  phase: StepPhase;
  hash?: string;
  error?: string;
  /** mô tả thêm cho người dùng phổ thông, ví dụ "Không tốn AVAX — nền tảng trả phí mạng" */
  note?: string;
}

const PHASE_TEXT: Record<StepPhase, string> = {
  idle: "Chưa bắt đầu",
  waiting: "Chờ bước trước",
  simulating: "Đang kiểm tra trước…",
  signing: "Chờ bạn xác nhận trong ví",
  pending: "Đang xác nhận trên Avalanche…",
  success: "Hoàn tất",
  error: "Không thành công",
};

/** Trạng thái giao dịch từng bước: đang ký → đang gửi → đang xác nhận → thành công/thất bại. */
export function TxSteps({ steps, className }: { steps: TxStepView[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2", className)} aria-live="polite">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-3 transition-colors duration-[var(--duration-hover)]",
            s.phase === "success" ? "border-[#a7f3d0] bg-success-soft/60" : s.phase === "error" ? "border-[#fecaca] bg-danger-soft/60" : "border-line bg-surface",
          )}
        >
          <StepIcon phase={s.phase} index={i} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{s.label}</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={s.phase + (s.error ?? "")}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className={cn("text-sm", s.phase === "error" ? "text-danger-ink" : "text-ink-muted")}
              >
                {s.phase === "error" && s.error ? s.error : PHASE_TEXT[s.phase]}
                {s.note && s.phase !== "error" && <span className="block text-xs">{s.note}</span>}
              </motion.p>
            </AnimatePresence>
            {s.hash && <TxHash hash={s.hash} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TxHash({ hash }: { hash: string }) {
  const url = txUrl(hash);
  return (
    <div className="mt-1 flex items-center gap-1 font-mono text-xs text-ink-muted">
      <span>tx {shortHex(hash, 10, 6)}</span>
      <CopyButton value={hash} label="Sao chép mã giao dịch" />
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="font-sans font-semibold text-primary hover:underline">
          Xem trên Snowtrace
        </a>
      )}
    </div>
  );
}

function StepIcon({ phase, index }: { phase: StepPhase; index: number }) {
  const busy = phase === "simulating" || phase === "signing" || phase === "pending";
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors",
        phase === "success" ? "bg-success text-white" : phase === "error" ? "bg-danger text-white" : busy ? "bg-primary-soft text-primary" : "bg-surface-muted text-ink-muted",
      )}
      aria-hidden
    >
      {phase === "success" ? (
        <motion.svg initial={{ scale: 0.4 }} animate={{ scale: 1 }} viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.6">
          <motion.path d="M4 10.5l3.5 3.5L16 6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
        </motion.svg>
      ) : phase === "error" ? (
        "!"
      ) : busy ? (
        <Spinner className="size-4" />
      ) : (
        index + 1
      )}
    </span>
  );
}
