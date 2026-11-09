"use client";

import { useState, type ReactNode } from "react";
import { describeChainError } from "@/lib/chainErrors";
import { network } from "@/lib/config";
import { useAccountWallet, useWalletActions } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { LoginButton } from "@/features/auth/login-button";
import { BrowserWalletNotice } from "@/features/earn/bound-email-notice";

/**
 * Cổng cho các trang cần ký bằng MetaMask/Core (tạo chiến dịch, mua, thư viện): phải ĐĂNG NHẬP Gmail và MetaMask phải
 * đang chọn ĐÚNG ví đã gắn với Gmail đó. Đủ điều kiện thì render `children`, chưa thì hiện đúng một việc cần làm.
 */
export function WalletGate({ purpose, children, compact }: { purpose: string; children: ReactNode; compact?: boolean }) {
  const aw = useAccountWallet();
  if (aw.account && aw.metamask === "ready") return <>{children}</>;
  return <WalletStatus purpose={purpose} compact={compact} />;
}

export function WalletStatus({ purpose, compact }: { purpose: string; compact?: boolean }) {
  const aw = useAccountWallet();
  const actions = useWalletActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error("Chưa kết nối được ví", describeChainError(e));
    } finally {
      setBusy(false);
    }
  };
  const box = compact ? "flex flex-col gap-3" : "flex flex-col items-center gap-4 text-center";

  if (!aw.account || !aw.address) {
    return (
      <div className={box}>
        <p className="text-ink-muted">Đăng nhập để {purpose}.</p>
        <LoginButton fullWidth={compact} />
      </div>
    );
  }
  const bound = (
    <div className="min-w-0 text-left text-sm">
      <p className="font-medium">Ví đã liên kết với tài khoản này</p>
      <code className="mt-1 block break-all font-mono text-xs">{aw.address}</code>
    </div>
  );
  if (aw.metamask === "disconnected" && aw.isBrowserWallet) {
    return (
      <div className="flex flex-col gap-3">
        <BrowserWalletNotice purpose={purpose} />
        {bound}
        <Button variant="outline" size="sm" loading={busy} onClick={() => act(() => actions.ensure(aw.address!))}>
          Kết nối MetaMask
        </Button>
      </div>
    );
  }
  if (aw.metamask === "disconnected") {
    return (
      <div className={box}>
        <p className="text-ink-muted">Kết nối MetaMask để {purpose}.</p>
        {bound}
        <Button loading={busy} onClick={() => act(() => actions.ensure(aw.address!))} className={compact ? "w-full" : undefined}>
          Kết nối MetaMask
        </Button>
      </div>
    );
  }
  if (aw.metamask === "wrong-account") {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-warning-soft p-4 text-left text-sm text-warning-ink">
        <p className="font-semibold">MetaMask đang chọn ví khác</p>
        <p>Hãy chọn đúng ví đã liên kết bên dưới trong MetaMask. Nếu chưa có, bạn cần nạp ví đó vào MetaMask.</p>
        {bound}
        <p className="text-xs">
          Ví đang kết nối: <code className="break-all font-mono">{aw.connected}</code>
        </p>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => act(actions.pickAccount)}>
          Chọn tài khoản trong MetaMask
        </Button>
      </div>
    );
  }
  // wrong-chain
  return (
    <div className={box}>
      <p className="text-ink-muted">Ví đang ở mạng khác.</p>
      <Button variant="secondary" loading={busy} onClick={() => act(actions.switchChain)} className={compact ? "w-full" : undefined}>
        Chuyển sang {network.chain.name}
      </Button>
    </div>
  );
}
