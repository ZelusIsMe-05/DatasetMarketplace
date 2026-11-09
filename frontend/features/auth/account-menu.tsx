"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDisconnect } from "wagmi";
import { cn } from "@/lib/cn";
import { moneyFromUnits } from "@/lib/money";
import { useFx } from "@/hooks/queries";
import { useTokenBalance } from "@/hooks/useChain";
import { useAccountWallet } from "@/hooks/useSessions";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { AccountSettings } from "@/features/auth/account-settings";
import { LoginButton } from "@/features/auth/login-button";
import { Avatar, useProfile } from "@/features/auth/profile";

/**
 * Header: chưa đăng nhập ⇒ nút "Đăng nhập". Đã đăng nhập ⇒ ảnh đại diện + tên; menu chỉ gồm số dư, Cài đặt, Đăng xuất.
 * Trạng thái MetaMask (chọn nhầm ví / sai mạng) chỉ hiện ở trang cần ký (WalletGate), không làm rối menu.
 */
export function AccountMenu({ fullWidth }: { fullWidth?: boolean }) {
  const auth = useAuth();
  const aw = useAccountWallet();
  const profile = useProfile();
  const { disconnect } = useDisconnect();
  const balance = useTokenBalance(aw.address ?? undefined);
  const fx = useFx();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
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

  if (!mounted) return <div className={cn("h-11 w-36 rounded-[var(--radius-control)] bg-surface-muted", fullWidth && "w-full")} aria-hidden />;
  if (!aw.account || !aw.address) return <LoginButton fullWidth={fullWidth} variant="outline" />;

  const money = balance.data !== undefined && fx.data ? moneyFromUnits(balance.data as bigint, fx.data.rate) : null;
  const item = "w-full rounded-xl px-3 py-2 text-left text-sm font-medium";

  return (
    <div ref={wrap} className={cn("relative", fullWidth && "w-full")}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản ${aw.email}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface pl-1.5 pr-3.5 font-semibold text-ink transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-soft)]",
          fullWidth && "w-full",
        )}
      >
        <Avatar name={profile.name} avatar={profile.avatar} address={aw.address} />
        <span className="max-w-[10rem] truncate text-sm">{profile.name}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-lift"
          >
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar name={profile.name} avatar={profile.avatar} address={aw.address} className="size-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{profile.name}</p>
                <p className="truncate text-xs text-ink-muted">{aw.email}</p>
              </div>
            </div>
            <div className="mx-1 mb-1 rounded-xl bg-canvas px-3 py-2.5">
              <p className="text-caption">Số dư</p>
              <p className="text-lg font-bold tabular text-ink">{money?.display ?? "…"}</p>
            </div>
            <button role="menuitem" type="button" className={cn(item, "hover:bg-surface-muted")} onClick={() => { setSettings(true); setOpen(false); }}>
              Cài đặt
            </button>
            <button
              role="menuitem"
              type="button"
              className={cn(item, "text-danger-ink hover:bg-danger-soft")}
              onClick={() => {
                auth.signOut();
                disconnect();
                setOpen(false);
                toast.success("Đã đăng xuất");
              }}
            >
              Đăng xuất
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AccountSettings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
