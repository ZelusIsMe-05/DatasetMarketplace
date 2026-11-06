"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { network } from "@/lib/config";
import { cn } from "@/lib/cn";
import { shortHex } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";

/** Nút ví Core/MetaMask (người mua, người tạo). Người đóng góp dùng ví trong trình duyệt ở /earn. */
export function ConnectWallet({ className, fullWidth }: { className?: string; fullWidth?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!mounted) return <div className={cn("h-11 w-40 rounded-[var(--radius-control)] bg-surface-muted", className)} aria-hidden />;

  if (!isConnected || !address) {
    return (
      <Button
        variant="outline"
        className={cn(fullWidth && "w-full", className)}
        loading={isPending}
        onClick={async () => {
          const injected = connectors[0];
          if (!injected || typeof window === "undefined" || !("ethereum" in window)) {
            toast.error("Chưa có ví trên trình duyệt", "Hãy cài Core hoặc MetaMask rồi tải lại trang.");
            return;
          }
          try {
            await connectAsync({ connector: injected });
          } catch (e) {
            toast.error("Không kết nối được ví", e instanceof Error ? e.message.split("\n")[0] : undefined);
          }
        }}
        icon={<WalletIcon />}
      >
        Kết nối ví
      </Button>
    );
  }

  const wrongChain = chainId !== network.chain.id;
  if (wrongChain) {
    return (
      <Button
        variant="secondary"
        className={cn("!bg-warning-soft !text-warning-ink", fullWidth && "w-full", className)}
        loading={switching}
        onClick={() => switchChainAsync({ chainId: network.chain.id }).catch(() => toast.error("Không chuyển được mạng", `Hãy chọn ${network.chain.name} trong ví.`))}
      >
        Chuyển sang {network.chain.name}
      </Button>
    );
  }

  return (
    <div ref={wrap} className={cn("relative", fullWidth && "w-full", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface pl-2 pr-3.5 font-semibold text-ink transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-soft)]",
          fullWidth && "w-full",
        )}
      >
        <span className="size-7 rounded-full" style={{ background: avatarGradient(address) }} aria-hidden />
        <span className="font-mono text-sm">{shortHex(address)}</span>
        <span className="size-2 rounded-full bg-success" aria-label="Đã kết nối" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-surface p-2 shadow-lift"
          >
            <p className="px-3 py-2 text-caption">Mạng {network.chain.name}</p>
            <button role="menuitem" type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface-muted" onClick={() => { navigator.clipboard.writeText(address); toast.success("Đã sao chép địa chỉ ví"); setOpen(false); }}>
              Sao chép địa chỉ
            </button>
            <button role="menuitem" type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-danger-ink hover:bg-danger-soft" onClick={() => { disconnect(); setOpen(false); }}>
              Ngắt kết nối
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function avatarGradient(address: string): string {
  const h = parseInt(address.slice(2, 8), 16) % 360;
  return `linear-gradient(135deg, hsl(${h} 85% 62%), hsl(${(h + 70) % 360} 80% 55%))`;
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="2.5" y="5" width="15" height="11" rx="2.5" />
      <path d="M2.5 8h15M13.5 11.5h1" strokeLinecap="round" />
    </svg>
  );
}
