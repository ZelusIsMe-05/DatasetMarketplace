"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LoginPanel } from "@/features/auth/login-panel";

export function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="10" cy="7" r="3.25" />
      <path d="M3.75 16.5c.9-3 3.4-4.5 6.25-4.5s5.35 1.5 6.25 4.5" strokeLinecap="round" />
    </svg>
  );
}

/** Nút "Đăng nhập" mở hộp đăng nhập (hiện chỉ có Google); lần đầu có thêm bước liên kết ví. */
export function LoginButton({
  label = "Đăng nhập", fullWidth, size = "md", variant = "primary",
}: {
  label?: string;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={fullWidth ? "w-full" : undefined} icon={<UserIcon />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Đăng nhập" size="sm" variant="minimal">
        <LoginPanel context="dialog" onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
