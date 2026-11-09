"use client";

import { useWalletSession } from "@/hooks/useSessions";
import { Card } from "@/components/ui/card";
import { WalletStatus } from "@/features/auth/wallet-status";

/**
 * Người tạo chiến dịch: ĐĂNG NHẬP Gmail; ví MetaMask/Core đi theo Gmail (ví đã gắn trong DB — implementation-plan §3 #27).
 * Lần đầu, hộp đăng nhập hướng dẫn gắn ví; các lần sau người dùng chủ động kết nối đúng ví khi tạo chiến dịch.
 * Nháp chiến dịch gắn với ví của tài khoản đã đăng nhập.
 */
export function CreatorGate({ children }: { children: React.ReactNode }) {
  const w = useWalletSession();
  if (w.account && w.ready) return <>{children}</>;
  return (
    <Card padding="lg" className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
      <h2 className="text-h3">{w.account ? "Kết nối đúng ví của bạn" : "Đăng nhập để tạo chiến dịch"}</h2>
      <WalletStatus purpose="tạo chiến dịch" />
    </Card>
  );
}
