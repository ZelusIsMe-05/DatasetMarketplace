"use client";

import "@/lib/legacy-storage";
import { useState, useSyncExternalStore } from "react";
import { useHealth } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/**
 * Khung "Đăng nhập thử" CHỈ dành cho kiểm thử tự động (Playwright không đăng nhập Google được).
 * Người dùng không thấy: chỉ hiện khi backend ở chế độ dev (NETWORK=local + DEV_AUTH_ENABLED) VÀ trình duyệt bật cờ
 * `localStorage["datasetmarketplace.devLogin"] = "1"` (e2e tự bật). Ngoài local, backend không có endpoint đăng nhập thử.
 */
export const DEV_LOGIN_KEY = "datasetmarketplace.devLogin";

const noSubscribe = () => () => {};
const optedIn = () => {
  try {
    return localStorage.getItem(DEV_LOGIN_KEY) === "1";
  } catch {
    return false;
  }
};

export function DevLogin({ label, placeholder, busy, onLogin }: { label: string; placeholder: string; busy: boolean; onLogin: (email: string) => void }) {
  const health = useHealth();
  const enabled = useSyncExternalStore(noSubscribe, optedIn, () => false);
  const [email, setEmail] = useState("");
  if (!enabled || !health.data?.dev_mode) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onLogin(email);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-warning-soft/60 p-4 text-left"
    >
      <p className="text-sm font-semibold text-warning-ink">Đăng nhập thử — chỉ dùng cho kiểm thử tự động ở môi trường local</p>
      <Field label={label}>
        <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={placeholder} required />
      </Field>
      <Button type="submit" variant="outline" loading={busy} disabled={!email.includes("@")}>
        Đăng nhập thử
      </Button>
    </form>
  );
}
