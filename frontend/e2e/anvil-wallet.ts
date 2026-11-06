// CHỈ DÙNG TRONG TEST: ví EIP-1193 giả lập "MetaMask" chuyển mọi yêu cầu tới Anvil.
// Anvil giữ sẵn khóa của các tài khoản dev nên eth_sendTransaction / personal_sign / eth_signTypedData_v4
// được ký thật bởi node — giao dịch và chữ ký là thật, không có kết quả giả.
import type { BrowserContext } from "@playwright/test";

export const ANVIL = {
  creator: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // anvil #2
  labx: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // anvil #5
} as const;

export async function installAnvilWallet(ctx: BrowserContext, account: string, rpc = "http://127.0.0.1:8545") {
  await ctx.addInitScript(
    ({ account, rpc }) => {
      let id = 0;
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
      const call = async (method: string, params: unknown[]) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
        return j.result;
      };
      (window as unknown as { ethereum: unknown }).ethereum = {
        isMetaMask: true,
        request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [account];
            case "eth_chainId":
              return "0x7a69";
            case "net_version":
              return "31337";
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_requestPermissions":
            case "wallet_getPermissions":
              return [{ parentCapability: "eth_accounts" }];
            default:
              return call(method, params);
          }
        },
        on: (e: string, cb: (...a: unknown[]) => void) => {
          (listeners[e] ||= []).push(cb);
        },
        removeListener: (e: string, cb: (...a: unknown[]) => void) => {
          listeners[e] = (listeners[e] || []).filter((x) => x !== cb);
        },
      };
    },
    { account, rpc },
  );
}
