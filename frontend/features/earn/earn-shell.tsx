"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useContributor } from "@/hooks/useSessions";
import { Avatar, useProfile } from "@/features/auth/profile";
import { Skeleton } from "@/components/ui/states";
import { Onboarding } from "@/features/earn/onboarding";

const TABS = [
  { href: "/earn", label: "Tổng quan" },
  { href: "/earn/campaigns", label: "Ghi âm" },
  { href: "/earn/history", label: "Bản ghi của tôi" },
  { href: "/earn/earnings", label: "Thu nhập" },
];

function useMounted() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Cổng cho từng trang người đóng góp: chưa thiết lập ví/đăng nhập → onboarding. */
export function RequireContributor({ children }: { children: ReactNode }) {
  const c = useContributor();
  const mounted = useMounted();
  // Phiên cũ (vd. database đã reset) được AuthProvider kiểm tra lúc tải trang và xóa khi API trả 401.
  if (!mounted) {
    return (
      <div className="py-12" role="status" aria-label="Đang tải">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="mt-6 h-64" />
      </div>
    );
  }
  if (c.stage !== "ready") {
    return (
      <div className="py-10 sm:py-16">
        <div className="mx-auto mb-10 max-w-xl text-center">
          <span className="text-sm font-semibold text-primary">Kiếm tiền bằng giọng nói</span>
          <h1 className="mt-2 text-h1">Thiết lập trong khoảng một phút</h1>
        </div>
        <Onboarding />
      </div>
    );
  }
  return <>{children}</>;
}

/** Khung khu vực người đóng góp: luôn render trang con; thanh điều hướng con chỉ hiện khi đã sẵn sàng. */
export function EarnShell({ children }: { children: ReactNode }) {
  const c = useContributor();
  const profile = useProfile();
  const pathname = usePathname();
  const mounted = useMounted();
  return (
    <div className="container-page">
      {mounted && c.stage === "ready" && <div className="flex flex-col gap-4 border-b border-line pb-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Khu vực người đóng góp" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {TABS.map((t) => {
            const active = t.href === "/earn" ? pathname === "/earn" : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors", active ? "text-primary-active" : "text-ink-muted hover:text-ink")}>
                {active && <motion.span layoutId="earn-tab" className="absolute inset-0 rounded-xl bg-primary-soft" transition={{ type: "spring", bounce: 0.15, duration: 0.4 }} />}
                <span className="relative">{t.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Avatar name={profile.name} avatar={profile.avatar} address={c.address} />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold text-ink">{profile.name}</p>
            <p className="text-xs text-ink-muted" data-wallet={c.address} data-testid="earn-wallet-kind">
              {c.kind === "metamask" ? "MetaMask" : "Ví trình duyệt"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {c.kind === "browser" && (
              <button type="button" onClick={c.lockBrowserWallet} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink">
                Khóa ví
              </button>
            )}
            {/* Đổi cách ký cho CÙNG ví đã gắn: chỉ có ý nghĩa khi ví trình duyệt trên máy này chính là ví đó */}
            {c.isBrowserWallet && (
              <button
                type="button"
                onClick={() => c.setEarnWallet(c.kind === "metamask" ? "browser" : "metamask")}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                {c.kind === "metamask" ? "Dùng ví trình duyệt" : "Dùng MetaMask"}
              </button>
            )}
          </div>
        </div>
      </div>}
      {children}
    </div>
  );
}
