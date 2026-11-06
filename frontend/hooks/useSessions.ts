"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useAuth } from "@/providers/auth-provider";
import { createApi } from "@/services/api";

/** Người đóng góp: ví trong trình duyệt đã mở khóa + phiên đăng nhập của đúng ví đó. */
export function useContributor() {
  const auth = useAuth();
  const account = auth.browserAccount;
  const session = auth.sessionFor(auth.browserAddress);
  const api = useMemo(() => (session ? createApi(session.token) : null), [session]);
  // Ký challenge đăng nhập cần ví đã mở khóa, nên "locked" đứng trước "no-session".
  const stage: "no-wallet" | "locked" | "no-session" | "ready" = !auth.browserAddress
    ? "no-wallet"
    : !account
      ? "locked"
      : !session
        ? "no-session"
        : "ready";
  return { ...auth, account, session, api, stage, address: auth.browserAddress };
}

/** Người tạo / người mua: ví Core/MetaMask (wagmi) + phiên của ví đó (cần cho tạo chiến dịch). */
export function useWalletSession() {
  const auth = useAuth();
  const { address, isConnected, chainId } = useAccount();
  const session = auth.sessionFor(address);
  const api = useMemo(() => (session ? createApi(session.token) : null), [session]);
  return { address, isConnected, chainId, session, api, login: auth.login, logout: auth.logout };
}
