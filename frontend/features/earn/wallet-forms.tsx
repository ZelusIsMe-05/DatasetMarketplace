"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { shortHex } from "@/lib/format";
import { checkPassword, PASSWORD_RULES } from "@/lib/password";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input";

/** Tạo ví trên trình duyệt (cơ bản: ghi âm / rút tiền / thu hồi), khóa bằng mật khẩu mạnh. */
export function CreateBrowserWalletForm({ onCreated, intro }: { onCreated: (account: PrivateKeyAccount) => Promise<void> | void; intro?: ReactNode }) {
  const { createBrowserWallet } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const strength = checkPassword(pw);
  const matches = pw2.length > 0 && pw === pw2;
  const canSubmit = strength.valid && matches;
  const missing = PASSWORD_RULES.length - strength.passed;
  const status = !pw
    ? "Đặt mật khẩu đáp ứng đủ 5 điều kiện bên trên."
    : !strength.valid
      ? `Còn ${missing} điều kiện chưa đạt.`
      : !pw2
        ? "Nhập lại mật khẩu để xác nhận."
        : !matches
          ? "Hai mật khẩu chưa khớp."
          : "Mật khẩu hợp lệ — bạn có thể tạo ví.";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const acct = await createBrowserWallet(pw);
      toast.success("Đã tạo ví của bạn", "Ví nằm trong trình duyệt này. Hãy tải file sao lưu ở trang Tổng quan để không mất ví.");
      await onCreated(acct);
    } catch (e) {
      toast.error("Không tạo được ví", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5 text-left">
      {intro}
      <Field label="Mật khẩu ví" hint="Mật khẩu mạnh gồm chữ hoa, chữ thường, số và ký tự đặc biệt.">
        <PasswordInput autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </Field>
      <PasswordRequirements password={pw} />
      <Field
        label="Nhập lại mật khẩu"
        hint={matches ? <span className="font-medium text-success-ink">✓ Hai mật khẩu đã khớp</span> : "Nhập lại đúng mật khẩu ở trên."}
        error={pw2 && !matches ? "Hai mật khẩu chưa khớp" : null}
      >
        <PasswordInput autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </Field>
      <p role="status" aria-live="polite" className={canSubmit ? "text-center text-sm font-medium text-success-ink" : "text-center text-sm text-ink-muted"}>
        {status}
      </p>
      <Button type="submit" size="lg" loading={busy} disabled={!canSubmit}>
        Tạo ví của tôi
      </Button>
    </form>
  );
}

/** Mở khóa ví trình duyệt có sẵn trên máy này. */
export function UnlockBrowserWalletForm({ onUnlocked, intro }: { onUnlocked?: (account: PrivateKeyAccount) => Promise<void> | void; intro?: ReactNode }) {
  const { unlockBrowserWallet, browserAddress } = useAuth();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const acct = await unlockBrowserWallet(pw);
      await onUnlocked?.(acct);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sai mật khẩu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5 text-left">
      {intro !== undefined ? intro : (
        <p className="text-center text-ink-muted">
          Ví <span className="font-mono text-ink">{browserAddress ? shortHex(browserAddress) : ""}</span> trên trình duyệt này đang được khóa.
        </p>
      )}
      <Field label="Mật khẩu ví" error={error} hint="Nhập đúng mật khẩu bạn đã đặt khi tạo ví trên trình duyệt này.">
        <PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
      </Field>
      <Button type="submit" size="lg" loading={busy} disabled={!pw}>
        Mở khóa
      </Button>
    </form>
  );
}
