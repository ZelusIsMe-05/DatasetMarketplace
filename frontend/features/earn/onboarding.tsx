"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { shortHex } from "@/lib/format";
import { useHealth } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Stepper } from "@/components/ui/misc";
import { PasswordInput, PasswordRequirements } from "@/components/ui/password-input";
import { checkPassword, PASSWORD_RULES } from "@/lib/password";
import { GoogleSignIn } from "@/features/earn/google-signin";

const STEPS = [{ label: "Ví của bạn" }, { label: "Đăng nhập" }, { label: "Bắt đầu" }];

/** Thiết lập người đóng góp: ví tạo trong trình duyệt (mã hóa bằng mật khẩu) → đăng nhập (1 email = 1 ví). */
export function Onboarding() {
  const c = useContributor();
  const step = c.stage === "no-wallet" || c.stage === "locked" ? 0 : c.stage === "no-session" ? 1 : 2;
  return (
    <div className="mx-auto w-full max-w-xl">
      <Stepper steps={STEPS} current={step} />
      <div className="surface-card mt-8 overflow-hidden p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div key={c.stage} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
            {c.stage === "no-wallet" && <CreateWallet />}
            {c.stage === "locked" && <UnlockWallet />}
            {c.stage === "no-session" && <SignIn />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CreateWallet() {
  const { createBrowserWallet } = useContributor();
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
      await createBrowserWallet(pw);
      toast.success("Đã tạo ví của bạn", "Ví nằm trong trình duyệt này và được mã hóa bằng mật khẩu.");
    } catch (e) {
      toast.error("Không tạo được ví", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h2 className="text-h2">Tạo ví để nhận tiền</h2>
        <p className="mt-2 text-ink-muted">
          Ví được tạo ngay trong trình duyệt — không cần cài đặt, không cần AVAX. Mật khẩu chỉ dùng để mã hóa ví trên máy này; chúng tôi không
          lưu và không khôi phục được mật khẩu.
        </p>
      </div>
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
      <p role="status" aria-live="polite" className={canSubmit ? "text-sm font-medium text-success-ink" : "text-sm text-ink-muted"}>
        {status}
      </p>
      <Button type="submit" size="lg" loading={busy} disabled={!canSubmit}>
        Tạo ví của tôi
      </Button>
    </form>
  );
}

function UnlockWallet() {
  const { unlockBrowserWallet, address } = useContributor();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlockBrowserWallet(pw);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sai mật khẩu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h2 className="text-h2">Mở khóa ví</h2>
        <p className="mt-2 text-ink-muted">
          Ví <span className="font-mono text-ink">{address ? shortHex(address) : ""}</span> đang được khóa. Nhập mật khẩu để ký đồng thuận, ghi âm và rút tiền.
        </p>
      </div>
      <Field label="Mật khẩu ví" error={error} hint="Nhập đúng mật khẩu bạn đã đặt khi tạo ví trên trình duyệt này.">
        <PasswordInput autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
      </Field>
      <Button type="submit" size="lg" loading={busy} disabled={!pw}>
        Mở khóa
      </Button>
    </form>
  );
}

function SignIn() {
  const { account, login } = useContributor();
  const health = useHealth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async (method: Parameters<typeof login>[0]["method"]) => {
    if (!account) return;
    setBusy(true);
    try {
      await login({ address: account.address, signMessage: (message) => account.signMessage({ message }), method });
      toast.success("Đăng nhập thành công", "Email của bạn đã được gắn với ví này.");
    } catch (e) {
      toast.error("Chưa đăng nhập được", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-h2">Đăng nhập</h2>
        <p className="mt-2 text-ink-muted">Mỗi email gắn với đúng một ví để chống tạo nhiều tài khoản. Ví sẽ ký một thông điệp xác nhận (không tốn phí).</p>
      </div>
      <GoogleSignIn onCredential={(idToken) => doLogin({ kind: "google", idToken })} disabled={busy} />
      {health.data?.dev_mode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doLogin({ kind: "dev", email });
          }}
          className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-warning-soft/60 p-4"
        >
          <p className="text-sm font-semibold text-warning-ink">Đăng nhập thử — chỉ có ở môi trường local (máy chủ đang chạy chế độ phát triển)</p>
          <Field label="Email">
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@vidu.vn" required />
          </Field>
          <Button type="submit" variant="outline" loading={busy} disabled={!email.includes("@")}>
            Đăng nhập thử
          </Button>
        </form>
      )}
    </div>
  );
}
