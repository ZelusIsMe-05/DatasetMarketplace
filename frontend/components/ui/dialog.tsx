"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "minimal";
  /** Không cho đóng khi đang xử lý giao dịch */
  dismissible?: boolean;
}

/**
 * Hộp thoại dùng <dialog> gốc: showModal() cho bẫy focus, Esc, inert nền miễn phí (WCAG 2.1.2, 2.4.3).
 * motion chỉ lo hiệu ứng vào/ra.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", variant = "default", dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    // Next.js 16 giữ trang cũ trong <Activity hidden>: effect cleanup chạy khi trang bị ẩn, nên phải đóng
    // dialog modal ở đây — nếu không, top layer làm cả tài liệu bị inert.
    return () => {
      if (d.open) d.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && dismissible) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-visible bg-transparent p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:flex"
      style={{ maxWidth: size === "sm" ? "26rem" : size === "md" ? "34rem" : "48rem" }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[1.5rem] border border-line bg-surface shadow-[0_24px_64px_-16px_rgb(15_23_42/0.35)]"
          >
            <div className={variant === "minimal" ? "relative h-14 shrink-0" : "flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5"}>
              <div className={variant === "minimal" ? "sr-only" : undefined}>
                <h2 id={titleId} className="text-h3">
                  {title}
                </h2>
                {description && (
                  <div id={descId} className="mt-1 text-sm text-ink-muted">
                    {description}
                  </div>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  className={cn("rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink", variant === "minimal" ? "absolute right-3 top-3 inline-flex size-11 items-center justify-center" : "-mr-2 p-2")}
                  aria-label="Đóng"
                >
                  <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {children && <div className={variant === "minimal" ? "overflow-y-auto px-6 pb-8 pt-1 sm:px-8" : "overflow-y-auto px-6 py-5"}>{children}</div>}
            {footer && <div className={cn("flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-4")}>{footer}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, children, confirmLabel, tone = "primary", loading }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
