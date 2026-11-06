"use client";

// Đọc trực tiếp contract (bigint, đúng decimals). Địa chỉ contract/token lấy từ /health của backend,
// nên frontend không phải chép tay địa chỉ sau mỗi lần deploy.
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { TOKEN_ABI, VOICE_CAMPAIGNS_ABI } from "@/lib/contracts";
import { useHealth } from "@/hooks/queries";

export function useAddresses() {
  const { data } = useHealth();
  return { vc: data?.voice_campaigns as Address | undefined, token: data?.token as Address | undefined };
}

export function useTokenBalance(owner?: Address) {
  const { token } = useAddresses();
  return useReadContract({
    address: token,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(token && owner), refetchInterval: 10_000 },
  });
}

export function useAllowance(owner?: Address) {
  const { token, vc } = useAddresses();
  return useReadContract({
    address: token,
    abi: TOKEN_ABI,
    functionName: "allowance",
    args: owner && vc ? [owner, vc] : undefined,
    query: { enabled: Boolean(token && owner && vc) },
  });
}

export function useWithdrawable(owner?: Address) {
  const { vc } = useAddresses();
  return useReadContract({
    address: vc,
    abi: VOICE_CAMPAIGNS_ABI,
    functionName: "withdrawable",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(vc && owner), refetchInterval: 15_000 },
  });
}
