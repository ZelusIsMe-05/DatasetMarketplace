"use client";

import "@/lib/legacy-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PrivateKeyAccount } from "viem/accounts";
import { createWallet, storedWalletAddress, unlockWallet } from "@/lib/browserWallet";
import {
  SESSION_EXPIRED_EVENT, allSessions, clearSession, clearSessionByToken, getActiveAddress, getSession, saveSession,
  setActiveAddress, type StoredSession,
} from "@/lib/session";
import { createApi, publicApi } from "@/services/api";

export type LoginMethod = { kind: "google"; idToken: string } | { kind: "dev"; email: string };

/** Người đóng góp chọn ví nào ở /earn: ví trong trình duyệt (cơ bản) hoặc MetaMask/Core (dùng được mọi vai trò). */
export type EarnWalletKind = "browser" | "metamask";
const EARN_WALLET_KEY = "datasetmarketplace.earnWallet.v1";

function readEarnWallet(): EarnWalletKind | null {
  try {
    const v = localStorage.getItem(EARN_WALLET_KEY);
    return v === "browser" || v === "metamask" ? v : null;
  } catch {
    return null;
  }
}

/** Gắn ví với email (chỉ LẦN ĐẦU): ví ký challenge chứng minh sở hữu. */
interface BindArgs {
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
  /** Ở /earn ký bằng ví trình duyệt hay MetaMask (cùng địa chỉ ví đã gắn với Gmail) */
  earnWallet: EarnWalletKind | null;
  setEarnWallet: (kind: EarnWalletKind) => void;
  /** Tài khoản đang đăng nhập: Gmail + đúng ví đã gắn với Gmail đó trong DB (null = chưa đăng nhập) */
  account: StoredSession | null;
  /**
   * Đăng nhập bằng Gmail. Gmail đã gắn ví ⇒ vào thẳng phiên của ví đó (không cần ký).
   * Gmail chưa gắn ví ⇒ ném ApiError `wallet_required` — giao diện chuyển sang bước gắn ví (`bindWallet`).
   */
  signIn: (method: LoginMethod) => Promise<StoredSession>;
  /** Lần đầu: gắn ví với Gmail (ký challenge) rồi đăng nhập. Lưu vào DB cho các lần sau. */
  bindWallet: (args: BindArgs) => Promise<StoredSession>;
  signOut: () => void;
  /** Phiên theo địa chỉ ví (nội bộ /earn và kiểm tra) */
  sessionFor: (address: string | null | undefined) => StoredSession | null;
  version: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [browserAddress, setBrowserAddress] = useState<`0x${string}` | null>(null);
  const [browserAccount, setBrowserAccount] = useState<PrivateKeyAccount | null>(null);
  const [earnWallet, setEarnWalletState] = useState<EarnWalletKind | null>(null);
  const [activeAddress, setActive] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // tăng khi phiên thay đổi để các hook đọc lại localStorage

  useEffect(() => {
    // Chỉ đọc localStorage sau khi hydrate để tránh lệch HTML server/client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrowserAddress(storedWalletAddress());
    setEarnWalletState(readEarnWallet());
    setActive(getActiveAddress());
  }, []);

  const setEarnWallet = useCallback((kind: EarnWalletKind) => {
    try {
      localStorage.setItem(EARN_WALLET_KEY, kind);
    } catch {
      /* bộ nhớ bị chặn: lựa chọn chỉ giữ tới khi tải lại trang */
    }
    setEarnWalletState(kind);
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

  const account = useMemo(
    () => getSession(activeAddress),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeAddress, version],
  );

  const activate = useCallback((stored: StoredSession) => {
    setActiveAddress(stored.address);
    setActive(stored.address.toLowerCase());
    setVersion((v) => v + 1);
    return stored;
  }, []);

  const signIn = useCallback(
    async (method: LoginMethod) => {
      const s = method.kind === "google" ? await publicApi.loginGoogle(method.idToken) : await publicApi.loginDev(method.email);
      return activate(saveSession(s));
    },
    [activate],
  );

  const bindWallet = useCallback(
    async ({ address, signMessage, method }: BindArgs) => {
      const ch = await publicApi.challenge(address);
      const signature = await signMessage(ch.message);
      const wallet = { address, nonce: ch.nonce, signature };
      const s =
        method.kind === "google"
          ? await publicApi.loginGoogle(method.idToken, wallet)
          : await publicApi.loginDev(method.email, wallet);
      return activate(saveSession(s));
    },
    [activate],
  );

  const signOut = useCallback(() => {
    const addr = getActiveAddress();
    if (addr) clearSession(addr);
    setActiveAddress(null);
    setActive(null);
    setBrowserAccount(null); // đăng xuất thì khóa luôn ví trình duyệt
    setVersion((v) => v + 1);
  }, []);

  // Phiên cũ (ví dụ đã reset-local: database mới, tài khoản cũ không còn) -> /auth/me trả 401 -> xóa phiên.
  useEffect(() => {
    for (const s of allSessions()) {
      createApi(s.token)
        .me()
        .catch(() => undefined); // 401 được xử lý chung qua SESSION_EXPIRED_EVENT bên dưới
    }
  }, []);

  // Bất kỳ lệnh gọi API nào có token bị 401 -> xóa đúng phiên đó; nếu là tài khoản đang đăng nhập thì đăng xuất.
  useEffect(() => {
    const onExpired = (e: Event) => {
      const token = (e as CustomEvent<string>).detail;
      if (!token || !clearSessionByToken(token)) return;
      if (!getSession(getActiveAddress())) {
        setActiveAddress(null);
        setActive(null);
      }
      setVersion((v) => v + 1);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      browserAddress, browserAccount, createBrowserWallet, unlockBrowserWallet, lockBrowserWallet,
      earnWallet, setEarnWallet, account, signIn, bindWallet, signOut, sessionFor, version,
    }),
    [browserAddress, browserAccount, createBrowserWallet, unlockBrowserWallet, lockBrowserWallet, earnWallet, setEarnWallet, account, signIn, bindWallet, signOut, sessionFor, version],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AuthProvider>");
  return ctx;
}
