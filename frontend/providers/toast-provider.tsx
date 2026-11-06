"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}
interface ToastApi {
  toast: (t: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<Tone, { ring: string; icon: string; label: string }> = {
  success: { ring: "border-success/30", icon: "bg-success", label: "Thành công" },
  error: { ring: "border-danger/30", icon: "bg-danger", label: "Lỗi" },
  info: { ring: "border-primary/30", icon: "bg-primary", label: "Thông báo" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const region = useRef<HTMLDivElement>(null);

  // Vùng thông báo nằm ở top layer (Popover API) và được nâng lên mỗi khi có thông báo mới,
  // để không bị che bởi <dialog> modal đang mở.
  useEffect(() => {
    const el = region.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      if (items.length) el.showPopover();
    } catch {
      /* trình duyệt cũ: vẫn hiển thị dạng fixed */
    }
  }, [items]);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === "error" ? 8000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: "success", title, description }),
      error: (title, description) => toast({ tone: "error", title, description }),
      info: (title, description) => toast({ tone: "info", title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={region}
        popover="manual"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 top-auto z-[60] m-0 flex w-full max-w-none flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-4 sm:items-end sm:p-6 [&:not(:popover-open)]:flex"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-surface p-4 shadow-lift",
                TONE[t.tone].ring,
              )}
            >
              <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TONE[t.tone].icon)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  <span className="sr-only">{TONE[t.tone].label}: </span>
                  {t.title}
                </p>
                {t.description && <p className="mt-0.5 break-words text-sm text-ink-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                aria-label="Đóng thông báo"
              >
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải nằm trong <ToastProvider>");
  return ctx;
}
