"use client";

import Link from "next/link";
import { useState } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { useAccount, useConfig, useSignMessage } from "wagmi";
import { getAccount } from "wagmi/actions";
import { describeChainError } from "@/lib/chainErrors";
import { network } from "@/lib/config";
import { shortHex } from "@/lib/format";
import { useWalletActions } from "@/hooks/useSessions";
import { useAuth, type LoginMethod } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { DevLogin } from "@/features/earn/dev-login";
import { GoogleSignIn } from "@/features/earn/google-signin";
import { CreateBrowserWalletForm, UnlockBrowserWalletForm } from "@/features/earn/wallet-forms";

/** Email hiển thị của lượt đăng nhập (Google: đọc từ ID token — chỉ để hiển thị, máy chủ mới là nơi xác minh). */
function emailOf(m: LoginMethod): string | null {
  if (m.kind === "dev") return m.email;
  try {
    const part = m.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(part)) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

/**
 * Đăng nhập bằng Gmail; ví đi theo Gmail (implementation-plan §3 #27).
 * 1. Gmail đã gắn ví ⇒ vào thẳng tài khoản và báo thành công; không mở MetaMask.
 * 2. Gmail chưa gắn ví (lần đầu) ⇒ chọn ví và ký xác nhận một lần; máy chủ lưu Gmail ↔ ví cho các lần sau.
 *
 * context="dialog": hộp đăng nhập ở header / các trang (gắn MetaMask; ví trình duyệt tạo ở trang Kiếm tiền).
 * context="earn": trang Kiếm tiền — gắn được cả ví trình duyệt (tạo mới hoặc mở khóa ví có sẵn).
 */
export function LoginPanel({ context, onDone }: { context: "dialog" | "earn"; onDone?: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [pending, setPending] = useState<LoginMethod | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    toast.success("Đăng nhập thành công");
    onDone?.();
  };

  const signIn = async (method: LoginMethod) => {
    setBusy(true);
    try {
      await auth.signIn(method);
      finish();
    } catch (e) {
      if (e instanceof ApiError && e.code === "wallet_required") setPending(method);
      else toast.error("Chưa đăng nhập được", describeChainError(e));
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return <BindWallet method={pending} context={context} onBack={() => setPending(null)} onBound={finish} onDone={onDone} />;
  }
  return (
    <div className="flex flex-col gap-7 text-center">
      <div className="flex flex-col items-center gap-6">
        <Logo />
        <div className="space-y-3">
          <h2 className="text-h2">Chào mừng bạn</h2>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-ink-muted">
            Đăng nhập để đóng góp, khám phá và mua dữ liệu giọng nói.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <GoogleSignIn onCredential={(idToken) => void signIn({ kind: "google", idToken })} disabled={busy} />
      </div>
      <div className="border-t border-line pt-5">
        <Link
          href="/huong-dan"
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
          className="inline-flex items-center rounded-lg px-2 py-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Lần đầu sử dụng?
          <span className="sr-only">(mở trong tab mới)</span>
        </Link>
      </div>
      <DevLogin label="Email" placeholder="ban@vidu.vn" busy={busy} onLogin={(email) => void signIn({ kind: "dev", email })} />
    </div>
  );
}

/** Lần đầu: gắn một ví với Gmail (ký xác nhận, không tốn phí). */
function BindWallet({
  method, context, onBack, onBound, onDone,
}: {
  method: LoginMethod;
  context: "dialog" | "earn";
  onBack: () => void;
  onBound: () => void;
  onDone?: () => void;
}) {
  const auth = useAuth();
  const toast = useToast();
  const config = useConfig();
  const mm = useAccount();
  const { signMessageAsync } = useSignMessage();
  const actions = useWalletActions();
  const [busy, setBusy] = useState<"connect" | "bind" | "pick" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const email = emailOf(method);
  const mmAddress = mm.isConnected ? mm.address : undefined;
  const wrongChain = !!mmAddress && mm.chainId !== network.chain.id;

  const run = async (kind: "connect" | "bind" | "pick", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = describeChainError(e);
      setError(msg);
      toast.error("Chưa gắn được ví", msg);
    } finally {
      setBusy(null);
    }
  };

  const bindMetaMask = () =>
    run("bind", async () => {
      const addr = getAccount(config).address;
      if (!addr) throw new Error("Chưa kết nối MetaMask/Core");
      await auth.bindWallet({ address: addr, signMessage: (message) => signMessageAsync({ account: addr, message }), method });
      if (context === "earn" && auth.browserAddress?.toLowerCase() === addr.toLowerCase()) auth.setEarnWallet("metamask");
      onBound();
    });

  const bindBrowser = async (acct: PrivateKeyAccount) => {
    setError(null);
    try {
      await auth.bindWallet({ address: acct.address, signMessage: (message) => acct.signMessage({ message }), method });
      auth.setEarnWallet("browser");
      onBound();
    } catch (e) {
      const msg = describeChainError(e);
      setError(msg);
      toast.error("Chưa gắn được ví", msg);
    }
  };

  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        {context === "earn" ? <h2 className="text-h2">Liên kết ví</h2> : <h3 className="text-h3">Liên kết ví</h3>}
        {email && <p className="mt-1 text-sm text-ink-muted">{email}</p>}
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line p-4">
        {!mmAddress ? (
          <Button loading={busy === "connect"} onClick={() => run("connect", async () => void (await actions.connect()))}>
            Kết nối MetaMask / Core
          </Button>
        ) : wrongChain ? (
          <Button variant="secondary" loading={busy === "connect"} onClick={() => run("connect", actions.switchChain)}>
            Chuyển sang {network.chain.name}
          </Button>
        ) : (
          <>
            <p className="font-mono text-sm text-ink">{shortHex(mmAddress)}</p>
            <Button loading={busy === "bind"} onClick={bindMetaMask}>
              Ký &amp; gắn ví này
            </Button>
            <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => run("pick", actions.pickAccount)}>
              Chọn tài khoản khác trong MetaMask
            </button>
          </>
        )}
      </div>

      {context === "earn" ? (
        <div className="flex flex-col gap-4 border-t border-line pt-6">
          <p className="text-sm font-semibold text-ink">Hoặc tạo ví trên trình duyệt</p>
          {auth.browserAddress ? (
            <UnlockBrowserWalletForm onUnlocked={bindBrowser} intro={<p className="text-center text-sm text-ink-muted">Mở khóa ví đã có trên trình duyệt này.</p>} />
          ) : (
            <CreateBrowserWalletForm onCreated={bindBrowser} />
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Chưa có MetaMask?{" "}
          <Link href="/earn" onClick={onDone} className="font-semibold text-primary hover:underline">
            Tạo ví ở trang Kiếm tiền
          </Link>
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
          {error}
        </p>
      )}
      <button type="button" onClick={onBack} className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Dùng Gmail khác
      </button>
    </div>
  );
}
