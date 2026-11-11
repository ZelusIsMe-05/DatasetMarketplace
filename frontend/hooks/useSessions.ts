"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useConfig, useConnect, useSignMessage, useSignTypedData, useSwitchChain, type Config } from "wagmi";
import { disconnect, getAccount } from "wagmi/actions";
import type { TypedDataResponse } from "@/types/api";
import { signTyped, typedDataArgs } from "@/lib/browserWallet";
import { network } from "@/lib/config";
import { useAuth, type EarnWalletKind } from "@/providers/auth-provider";
import { createApi } from "@/services/api";

/**
 * Trạng thái MetaMask/Core so với ví ĐÃ GẮN với Gmail đang đăng nhập (implementation-plan §3 #27):
 * - "disconnected": chưa kết nối MetaMask;
 * - "wrong-account": MetaMask đang chọn tài khoản khác ví đã gắn;
 * - "wrong-chain": đúng tài khoản nhưng sai mạng;
 * - "ready": đúng ví, đúng mạng — ký được.
 */
export type MetaMaskState = "disconnected" | "wrong-account" | "wrong-chain" | "ready";

/** Tài khoản đang đăng nhập (Gmail ↔ ví đã gắn trong DB) và tình trạng ví tương ứng trên trình duyệt. */
export function useAccountWallet() {
  const auth = useAuth();
  const wallet = useAccount();
  const account = auth.account;
  const address = (account?.address ?? null) as `0x${string}` | null;
  const isBrowserWallet = !!address && auth.browserAddress?.toLowerCase() === address.toLowerCase();
  const connected = wallet.isConnected && wallet.address ? wallet.address : null;
  const sameAccount = !!address && !!connected && connected.toLowerCase() === address.toLowerCase();
  const metamask: MetaMaskState = !connected ? "disconnected" : !sameAccount ? "wrong-account" : wallet.chainId !== network.chain.id ? "wrong-chain" : "ready";
  const api = useMemo(() => (account ? createApi(account.token) : null), [account]);
  return { account, address, email: account?.email ?? null, isBrowserWallet, connected, metamask, api };
}

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

function injectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null) as Eip1193 | null;
}

/** Ví có thật sự đang cho trang này dùng địa chỉ đó không (eth_accounts) — trạng thái wagmi có thể đã cũ. */
async function walletPermits(address: string): Promise<boolean> {
  const eth = injectedProvider();
  if (!eth) return false;
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
    return accounts.some((a) => a.toLowerCase() === address.toLowerCase());
  } catch {
    return false;
  }
}

/** Gỡ MỌI kết nối wagmi (không chỉ kết nối hiện tại) — dùng khi đăng xuất và khi dọn trạng thái cũ. */
export async function disconnectAll(config: Config): Promise<void> {
  for (const { connector } of [...config.state.connections.values()]) {
    await disconnect(config, { connector }).catch(() => undefined);
  }
}

/** Thao tác đưa MetaMask/Core về đúng ví đã gắn với Gmail: kết nối, mở bảng chọn tài khoản, chuyển mạng. */
export function useWalletActions() {
  const config = useConfig();
  const { connectAsync, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  /**
   * Kết nối MetaMask (nếu chưa) và trả địa chỉ đang chọn. wagmi báo "đã kết nối" nhưng ví đã thu quyền của trang
   * (đăng xuất ở tab khác, ngắt kết nối trong MetaMask...) ⇒ bỏ trạng thái cũ rồi xin quyền lại, không bắt F5.
   */
  const connect = useCallback(async (): Promise<`0x${string}`> => {
    const current = getAccount(config);
    if (current.isConnected && current.address) {
      if (await walletPermits(current.address)) return current.address;
      await disconnectAll(config);
    }
    const injected = connectors[0];
    if (!injected || !injectedProvider()) throw new Error("Chưa có ví MetaMask/Core trên trình duyệt này. Hãy cài ví rồi tải lại trang.");
    const r = await connectAsync({ connector: injected });
    return r.accounts[0];
  }, [config, connectAsync, connectors]);

  /** Mở bảng chọn tài khoản của MetaMask (wallet_requestPermissions) để chọn đúng ví đã gắn. */
  const pickAccount = useCallback(async () => {
    const eth = injectedProvider();
    if (!eth) throw new Error("Chưa có ví MetaMask/Core trên trình duyệt này.");
    await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  }, []);

  const switchChain = useCallback(async () => {
    await switchChainAsync({ chainId: network.chain.id });
  }, [switchChainAsync]);

  /**
   * Chỉ gọi khi người dùng chủ động bấm kết nối ở bước cần ký: kết nối nếu chưa, chuyển đúng mạng.
   * `target` là địa chỉ ví đã gắn với tài khoản trên backend, không lấy từ ví MetaMask đang chọn.
   * Trả false nếu MetaMask đang chọn tài khoản khác (giao diện hiện hướng dẫn chọn đúng tài khoản).
   */
  const ensure = useCallback(
    async (target: string): Promise<boolean> => {
      const addr = await connect();
      if (addr.toLowerCase() !== target.toLowerCase()) return false;
      if (getAccount(config).chainId !== network.chain.id) await switchChain();
      return true;
    },
    [config, connect, switchChain],
  );

  const disconnectWallet = useCallback(() => disconnectAll(config), [config]);

  return { connect, pickAccount, switchChain, ensure, disconnectAll: disconnectWallet };
}

/** Ký thông điệp đăng nhập + dữ liệu EIP-712 (Consent / Claim / Revoke) bằng ví người đóng góp đang dùng. */
export interface ContributorSigner {
  signMessage: (message: string) => Promise<`0x${string}`>;
  signTypedData: (td: TypedDataResponse) => Promise<`0x${string}`>;
}

export type ContributorStage = "signin" | "locked" | "connect" | "ready";

/**
 * Người đóng góp ở /earn: ĐĂNG NHẬP GMAIL TRƯỚC, ví đi theo Gmail (ví đã gắn trong DB).
 * Ví đã gắn là ví trình duyệt trên máy này ⇒ ký bằng ví đó (mở khóa bằng mật khẩu), trừ khi người dùng đã nâng cấp
 * và chọn MetaMask (cùng địa chỉ). Ví đã gắn không có trên máy này ⇒ phải dùng MetaMask/Core với đúng ví đó.
 * Ví nào cũng chỉ KÝ; nền tảng (relayer) gửi giao dịch và trả phí mạng.
 */
export function useContributor() {
  const auth = useAuth();
  const aw = useAccountWallet();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const address = aw.address;
  const kind: EarnWalletKind | null = !address ? null : aw.isBrowserWallet && auth.earnWallet !== "metamask" ? "browser" : "metamask";
  const account = auth.browserAccount;
  const unlocked = !!account && !!address && account.address.toLowerCase() === address.toLowerCase();

  const stage: ContributorStage = !aw.account
    ? "signin"
    : kind === "browser"
      ? unlocked ? "ready" : "locked"
      : aw.metamask === "ready" ? "ready" : "connect";

  const signer = useMemo<ContributorSigner | null>(() => {
    if (!address) return null;
    if (kind === "metamask") {
      if (aw.metamask !== "ready") return null;
      return {
        signMessage: (message) => signMessageAsync({ account: address, message }),
        signTypedData: (td) => signTypedDataAsync({ account: address, ...typedDataArgs(td) } as Parameters<typeof signTypedDataAsync>[0]),
      };
    }
    if (!account || !unlocked) return null;
    return { signMessage: (message) => account.signMessage({ message }), signTypedData: (td) => signTyped(account, td) };
  }, [kind, address, aw.metamask, account, unlocked, signMessageAsync, signTypedDataAsync]);

  return {
    ...auth,
    kind,
    account,
    session: aw.account,
    api: aw.api,
    stage,
    address,
    signer,
    metamask: aw.metamask,
    connected: aw.connected,
    isBrowserWallet: aw.isBrowserWallet,
  };
}

/** Người tạo / người mua: tài khoản đang đăng nhập + ví MetaMask/Core phải đúng ví đã gắn với Gmail đó. */
export function useWalletSession() {
  const aw = useAccountWallet();
  // Ví trình duyệt đã nạp vào MetaMask (nâng cấp, cùng địa chỉ) thì MetaMask "ready" ⇒ dùng được ở đây.
  return { ...aw, session: aw.account, ready: aw.metamask === "ready" };
}
