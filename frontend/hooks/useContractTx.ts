"use client";

import { useCallback, useState } from "react";
import type { Abi, Address, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { describeChainError } from "@/lib/chainErrors";

export type TxPhase = "idle" | "simulating" | "signing" | "pending" | "success" | "error";

export interface TxState {
  phase: TxPhase;
  hash?: `0x${string}`;
  error?: string;
  receipt?: TransactionReceipt;
}

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  account: Address;
}

/**
 * Giao dịch do ví người dùng gửi (Core/MetaMask): mô phỏng (eth_call, giải mã revert trước khi ví bật lên)
 * → ký trong ví → chờ receipt thật. Thành công chỉ khi receipt.status === "success".
 */
export function useContractTx() {
  const config = useConfig();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (call: ContractCall): Promise<TransactionReceipt> => {
      try {
        setState({ phase: "simulating" });
        const { request } = await simulateContract(config, call as Parameters<typeof simulateContract>[1]);
        setState({ phase: "signing" });
        const hash = await writeContract(config, request);
        setState({ phase: "pending", hash });
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") throw new Error("Giao dịch bị revert");
        setState({ phase: "success", hash, receipt });
        return receipt;
      } catch (e) {
        const error = describeChainError(e);
        setState((s) => ({ ...s, phase: "error", error }));
        throw new Error(error);
      }
    },
    [config],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, run, reset };
}
