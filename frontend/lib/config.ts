// Cấu hình theo môi trường (khớp backend/app/core/config.py). Khác biệt chỉ nằm ở đây + file .env.
import { avalanche, avalancheFuji, foundry } from "viem/chains";
import type { Chain } from "viem";

export type NetworkName = "local" | "fuji" | "mainnet";

interface NetworkProfile {
  name: NetworkName;
  chain: Chain;
  explorer: string;
  allowFaucet: boolean; // nút "Nhận mUSDC thử" chỉ có ở local/Fuji
}

const PROFILES: Record<NetworkName, NetworkProfile> = {
  local: { name: "local", chain: foundry, explorer: "", allowFaucet: true },
  fuji: { name: "fuji", chain: avalancheFuji, explorer: "https://testnet.snowtrace.io", allowFaucet: true },
  mainnet: { name: "mainnet", chain: avalanche, explorer: "https://snowtrace.io", allowFaucet: false },
};

const networkName = (process.env.NEXT_PUBLIC_NETWORK ?? "local") as NetworkName;
if (!(networkName in PROFILES)) {
  throw new Error(`NEXT_PUBLIC_NETWORK phải là local | fuji | mainnet (nhận: ${networkName})`);
}

export const network = PROFILES[networkName];
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || network.chain.rpcUrls.default.http[0];
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function txUrl(hash: string): string | null {
  return network.explorer ? `${network.explorer}/tx/${hash}` : null;
}
