"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { network } from "@/lib/config";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/brand/logo";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { BRAND } from "@/lib/brand";

const NAV = [
  { href: "/explore", label: "Khám phá dữ liệu" },
  { href: "/earn", label: "Kiếm tiền" },
  { href: "/create", label: "Tạo chiến dịch" },
  { href: "/library", label: "Thư viện của tôi" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/explore" && pathname.startsWith("/datasets"));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-[var(--duration-hover)]",
        scrolled || open ? "border-line bg-surface/85 shadow-[0_1px_0_rgb(15_23_42/0.02)] backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Bỏ qua tới nội dung chính
      </a>
      <div className="container-page flex h-16 items-center gap-6">
        <Link href="/" aria-label={`${BRAND.name} — trang chủ`} className="shrink-0 rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Điều hướng chính" className="hidden flex-1 items-center gap-1 xl:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap rounded-xl px-3.5 py-2 text-[0.9375rem] font-semibold transition-colors duration-[var(--duration-micro)]",
                active(n.href) ? "text-primary-active" : "text-ink-soft hover:text-ink",
              )}
            >
              {active(n.href) && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-primary-soft" transition={{ type: "spring", bounce: 0.15, duration: 0.45 }} />}
              <span className="relative">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-3 xl:flex">
          {network.name !== "mainnet" && (
            <span className="rounded-full border border-[#fde68a] bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning-ink" title="Môi trường thử nghiệm: tiền là mUSDC tự mint">
              {network.name === "local" ? "Local · Anvil" : "Fuji testnet"}
            </span>
          )}
          <ConnectWallet />
        </div>
        <button
          type="button"
          className="ml-auto grid size-11 place-items-center rounded-xl text-ink hover:bg-surface-muted xl:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Điều hướng chính (di động)"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line bg-surface xl:hidden"
          >
            <div className="container-page flex flex-col gap-1 py-4">
              {NAV.map((n, i) => (
                <motion.div key={n.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                  <Link
                    href={n.href}
                    aria-current={active(n.href) ? "page" : undefined}
                    className={cn("flex h-12 items-center rounded-xl px-4 text-base font-semibold", active(n.href) ? "bg-primary-soft text-primary-active" : "text-ink hover:bg-surface-muted")}
                  >
                    {n.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-3 border-t border-line pt-4">
                <ConnectWallet fullWidth />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Khung header tĩnh cùng chiều cao (dùng khi đang stream) — tránh layout shift. */
export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent">
      <div className="container-page flex h-16 items-center">
        <Logo />
      </div>
    </header>
  );
}
