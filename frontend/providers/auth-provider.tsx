"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { createWallet, storedWalletAddress, unlockWallet } from "@/lib/browserWallet";
import { clearSession, getSession, saveSession, type StoredSession } from "@/lib/session";
import { ApiError, createApi, publicApi } from "@/services/api";

export type LoginMethod = { kind: "google"; idToken: string } | { kind: "dev"; email: string };

interface LoginArgs {
  address: `0x${string}`;
  signMessage: (message: string) => Promise<`0x${string}`>;
  method: LoginMethod;
}

interface AuthContextValue {
  /** Ví trong trình duyệt (người đóng góp) */
  browserAddress: `0x${string}` | null;
  browserAccount: PrivateKeyAccount | null;
  createBrowserWallet: (password: string) => Promise<PrivateKeyAccount>;
  unlockBrowserWallet: (password: string) => Promise<PrivateKeyAccount>;
  lockBrowserWallet: () => void;
  /** Phiên đăng nhập theo ví */
  sessionFor: (address: string | null | undefined) => StoredSession | null;
  login: (args: LoginArgs) => Promise<StoredSession>;
  logout: (address: string) => void;
  version: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [browserAddress, setBrowserAddress] = useState<`0x${string}` | null>(null);
  const [browserAccount, setBrowserAccount] = useState<PrivateKeyAccount | null>(null);
  const [version, setVersion] = useState(0); // tăng khi phiên thay đổi để các hook đọc lại localStorage

  useEffect(() => {
    // Chỉ đọc localStorage sau khi hydrate để tránh lệch HTML server/client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrowserAddress(storedWalletAddress());
  }, []);

  const createBrowserWallet = useCallback(async (password: string) => {
    const acct = await createWallet(password);
    setBrowserAddress(acct.address);
    setBrowserAccount(acct);
    return acct;
  }, []);

  const unlockBrowserWallet = useCallback(async (password: string) => {
    const acct = await unlockWallet(password);
    setBrowserAccount(acct);
    return acct;
  }, []);

  const lockBrowserWallet = useCallback(() => setBrowserAccount(null), []);

  const sessionFor = useCallback(
    (address: string | null | undefined) => getSession(address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const login = useCallback(async ({ address, signMessage, method }: LoginArgs) => {
    const ch = await publicApi.challenge(address);
    const signature = await signMessage(ch.message);
    const s =
      method.kind === "google"
        ? await publicApi.loginGoogle(method.idToken, address, ch.nonce, signature)
        : await publicApi.loginDev(method.email, address, ch.nonce, signature);
    const stored = saveSession(s);
    setVersion((v) => v + 1);
    return stored;
  }, []);

  const logout = useCallback((address: string) => {
    clearSession(address);
    setVersion((v) => v + 1);
  }, []);

  // Phiên cũ (ví dụ backend đã redeploy, DB mới) -> /auth/me trả 401 -> xóa phiên.
  useEffect(() => {
    const addr = browserAddress;
    const s = getSession(addr);
    if (!addr || !s) return;
    createApi(s.token)
      .me()
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) logout(addr);
      });
  }, [browserAddress, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      browserAddress, browserAccount, createBrowserWallet, unlockBrowserWallet, lockBrowserWallet,
      sessionFor, login, logout, version,
    }),
    [browserAddress, browserAccount, createBrowserWallet, unlockBrowserWallet, lockBrowserWallet, sessionFor, login, logout, version],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}
