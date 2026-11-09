// CHỈ DÙNG TRONG TEST: ví EIP-1193 giả lập "MetaMask" chuyển yêu cầu tới Anvil.
// - installAnvilWallet: tài khoản dev của Anvil — Anvil giữ sẵn khóa nên eth_sendTransaction / personal_sign /
//   eth_signTypedData_v4 được ký thật bởi node.
// - installKeyWallet: khóa riêng bất kỳ (vd. giải ra từ file sao lưu ví trình duyệt = "nạp file vào MetaMask"):
//   personal_sign / eth_signTypedData_v4 được ký thật bằng viem ở phía Node qua exposeBinding.
// Giao dịch và chữ ký đều là thật, không có kết quả giả.
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { concat, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ANVIL = {
  creator: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // anvil #2
  labx: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // anvil #5
} as const;

/** Anvil của dự án (cổng 8386); đổi bằng E2E_RPC_URL nếu chạy nơi khác. */
export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8386";
const BINDING = "__e2eKeySign";

async function installProvider(ctx: BrowserContext, account: string, rpc: string, useBinding: boolean, signErrorCode: number | null = null) {
  await ctx.addInitScript(
    ({ account, rpc, binding, signErrorCode }) => {
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
            case "personal_sign":
            case "eth_signTypedData_v4":
              // Đúng lỗi MetaMask trả khi ví đang khóa hoặc tài khoản chưa được cấp quyền cho trang.
              if (signErrorCode) throw Object.assign(new Error("The requested method and/or account has not been authorized by the user."), { code: signErrorCode });
              if (binding) return (window as unknown as Record<string, (m: string, p: unknown[]) => Promise<string>>)[binding](method, params);
              return call(method, params);
            case "eth_sendTransaction":
              if (binding) throw Object.assign(new Error("Ví thử chỉ ký, không gửi giao dịch"), { code: 4200 });
              return call(method, params);
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
    { account, rpc, binding: useBinding ? BINDING : null, signErrorCode },
  );
}

export async function installAnvilWallet(ctx: BrowserContext, account: string, rpc = RPC) {
  await installProvider(ctx, account, rpc, false);
}

/** "MetaMask" kết nối được nhưng từ chối mọi yêu cầu ký với mã 4100 (ví khóa / tài khoản chưa được cấp quyền). */
export async function installUnauthorizedWallet(ctx: BrowserContext, account: string, rpc = RPC) {
  await installProvider(ctx, account, rpc, false, 4100);
}

/** "MetaMask" chứa đúng khóa này (tương đương Import account bằng file JSON). Áp dụng cho các lần tải trang sau. */
export async function installKeyWallet(ctx: BrowserContext, privateKey: Hex, rpc = RPC) {
  const acct = privateKeyToAccount(privateKey);
  await ctx.exposeBinding(BINDING, async (_src, method: string, params: unknown[]) => {
    if (method === "personal_sign") return acct.signMessage({ message: { raw: params[0] as Hex } });
    const td = JSON.parse(params[1] as string);
    const { EIP712Domain: _domain, ...types } = td.types;
    void _domain;
    return acct.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message });
  });
  await installProvider(ctx, acct.address, rpc, true);
  return acct.address;
}

/**
 * Giải file keystore V3 như MetaMask/geth: PBKDF2-HMAC-SHA256 → kiểm MAC keccak256 → AES-128-CTR.
 * Cài đặt độc lập với code trình duyệt (Node crypto), để test bắt được file sai chuẩn.
 */
export function decryptKeystoreV3(json: string, password: string): { privateKey: Hex; address: string } {
  const ks = JSON.parse(json);
  if (ks.version !== 3 || ks.crypto?.cipher !== "aes-128-ctr" || ks.crypto?.kdf !== "pbkdf2" || ks.crypto?.kdfparams?.prf !== "hmac-sha256") {
    throw new Error("Không phải keystore V3 PBKDF2/AES-128-CTR");
  }
  const p = ks.crypto.kdfparams;
  const dk = pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from(p.salt, "hex"), p.c, p.dklen, "sha256");
  const ct = Buffer.from(ks.crypto.ciphertext, "hex");
  const mac = keccak256(concat([dk.subarray(16, 32), ct])).slice(2);
  if (mac !== ks.crypto.mac) throw new Error("Sai MAC (sai mật khẩu hoặc file hỏng)");
  const d = createDecipheriv("aes-128-ctr", dk.subarray(0, 16), Buffer.from(ks.crypto.cipherparams.iv, "hex"));
  const privateKey = `0x${Buffer.concat([d.update(ct), d.final()]).toString("hex")}` as Hex;
  const address = privateKeyToAccount(privateKey).address;
  if (address.slice(2).toLowerCase() !== ks.address) throw new Error("Địa chỉ trong file không khớp khóa");
  return { privateKey, address };
}
