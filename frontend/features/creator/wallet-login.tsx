"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import { network } from "@/lib/config";
import { useHealth } from "@/hooks/queries";
import { useWalletSession } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { GoogleSignIn } from "@/features/earn/google-signin";

/** Người tạo chiến dịch: kết nối Core/MetaMask + đăng nhập bằng chính ví đó (nháp chiến dịch gắn với ví tạo). */
export function CreatorGate({ children }: { children: React.ReactNode }) {
  const w = useWalletSession();
  const health = useHealth();
  const toast = useToast();
  const { signMessageAsync } = useSignMessage();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  if (!w.isConnected || !w.address || w.chainId !== network.chain.id) {
    return (
      <Card padding="lg" className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <h2 className="text-h3">Kết nối ví tổ chức</h2>
        <p className="text-ink-muted">Người tạo chiến dịch dùng ví Core hoặc MetaMask: bạn tự ký giao dịch tạo chiến dịch, nạp quỹ mồi và rút phần doanh thu.</p>
        <ConnectWallet />
      </Card>
    );
  }
  if (!w.session) {
    const doLogin = async (method: { kind: "google"; idToken: string } | { kind: "dev"; email: string }) => {
      setBusy(true);
      try {
        await w.login({ address: w.address!, signMessage: (message) => signMessageAsync({ message }), method });
        toast.success("Đã đăng nhập", "Phiên đăng nhập gắn với ví đang kết nối.");
      } catch (e) {
        toast.error("Chưa đăng nhập được", e instanceof Error ? e.message.split("\n")[0] : undefined);
      } finally {
        setBusy(false);
      }
    };
    return (
      <Card padding="lg" className="mx-auto flex max-w-xl flex-col gap-4">
        <h2 className="text-h3">Đăng nhập bằng ví đang kết nối</h2>
        <p className="text-ink-muted">Máy chủ cần biết ví nào soạn chiến dịch để liên kết metadata với chiến dịch on-chain. Ví sẽ ký một thông điệp (không tốn phí).</p>
        <GoogleSignIn onCredential={(idToken) => doLogin({ kind: "google", idToken })} disabled={busy} />
        {health.data?.dev_mode && (
          <form onSubmit={(e) => { e.preventDefault(); void doLogin({ kind: "dev", email }); }} className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-warning-soft/60 p-4">
            <p className="text-sm font-semibold text-warning-ink">Đăng nhập thử — chỉ môi trường local</p>
            <Field label="Email tổ chức">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lab@vidu.vn" required />
            </Field>
            <Button type="submit" variant="outline" loading={busy} disabled={!email.includes("@")}>Đăng nhập thử</Button>
          </form>
        )}
      </Card>
    );
  }
  return <>{children}</>;
}
