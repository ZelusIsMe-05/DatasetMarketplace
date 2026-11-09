"use client";

// Giao dịch nền tảng trả phí mạng hộ (implementation-plan §3 #25): người dùng chỉ KÝ trong MetaMask/Core
// (permit EIP-2612 nếu cần trừ tiền + chữ ký EIP-712 của thao tác), relayer của backend gửi giao dịch.
// Không cần ETH/AVAX trong ví; phí xử lý (VNĐ) đã nằm trong hóa đơn mà người dùng ký đúng số đó.
import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import type { PermitSubmit, SponsoredQuote, SponsoredResult, TypedDataPayload } from "@/types/api";
import { typedDataArgs } from "@/lib/browserWallet";
import { describeChainError } from "@/lib/chainErrors";
import type { StepPhase, TxStepView } from "@/components/tx/tx-steps";

export function useWalletTypedSigner() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  return useCallback(
    (td: TypedDataPayload) =>
      signTypedDataAsync({ account: address, ...typedDataArgs({ typed_data: td, nonce: 0, deadline: 0 }) } as Parameters<
        typeof signTypedDataAsync
      >[0]),
    [address, signTypedDataAsync],
  );
}

export interface SignedQuote {
  fee: number;
  deadline: number;
  signature: string;
  permit: PermitSubmit | null;
}

/** Ký theo hóa đơn: permit trước (nếu allowance chưa đủ), rồi thao tác. `onStep` để cập nhật danh sách bước. */
export async function signQuote(
  sign: (td: TypedDataPayload) => Promise<string>,
  q: SponsoredQuote,
  onStep?: (step: "permit" | "action") => void,
): Promise<SignedQuote> {
  if (!q.can_submit || !q.sign) throw new Error(q.reason ?? "Chưa thực hiện được thao tác này");
  let permit: PermitSubmit | null = null;
  if (q.permit) {
    onStep?.("permit");
    permit = { value: q.permit.value, deadline: q.permit.deadline, signature: await sign(q.permit.typed_data) };
  }
  onStep?.("action");
  const signature = await sign(q.sign.typed_data);
  return { fee: q.fee.units, deadline: q.sign.deadline, signature, permit };
}

type StepKey = "quote" | "permit" | "sign" | "relay";
const IDLE: Record<StepKey, StepPhase> = { quote: "idle", permit: "idle", sign: "idle", relay: "idle" };

export interface FlowLabels {
  /** Bước báo giá hiển thị riêng (vd. "Máy chủ soạn nháp và báo giá"); bỏ trống = không hiện. */
  quote?: string;
  permit?: string;
  sign: string;
  relay?: string;
}

/**
 * Luồng chung: lấy báo giá → (ký permit) → ký thao tác → relayer gửi. Trạng thái từng bước cho <TxSteps>.
 * `run` trả kết quả, hoặc ném lỗi đã dịch sang tiếng Việt (bước lỗi được đánh dấu đỏ).
 */
export function useSponsoredFlow() {
  const sign = useWalletTypedSigner();
  const [phase, setPhase] = useState(IDLE);
  const [failed, setFailed] = useState<{ step: StepKey; message: string } | null>(null);
  const [needPermit, setNeedPermit] = useState(true);
  const [hash, setHash] = useState<string>();
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (
      getQuote: () => Promise<SponsoredQuote>,
      submit: (signed: SignedQuote, quote: SponsoredQuote) => Promise<SponsoredResult>,
      check?: (quote: SponsoredQuote) => Promise<void> | void,
    ): Promise<SponsoredResult> => {
      const set = (k: StepKey, v: StepPhase) => setPhase((p) => ({ ...p, [k]: v }));
      setRunning(true);
      setFailed(null);
      setHash(undefined);
      setPhase(IDLE);
      let step: StepKey = "quote";
      try {
        set("quote", "pending");
        const quote = await getQuote();
        if (!quote.can_submit) throw new Error(quote.reason ?? "Chưa thực hiện được thao tác này");
        await check?.(quote);
        set("quote", "success");
        setNeedPermit(Boolean(quote.permit));
        const signed = await signQuote(sign, quote, (s) => {
          if (s === "permit") {
            step = "permit";
            set("permit", "signing");
          } else {
            if (quote.permit) set("permit", "success");
            step = "sign";
            set("sign", "signing");
          }
        });
        set("sign", "success");
        step = "relay";
        set("relay", "pending");
        const res = await submit(signed, quote);
        setHash(res.tx_hash);
        set("relay", "success");
        return res;
      } catch (e) {
        const message = describeChainError(e);
        set(step, "error");
        setFailed({ step, message });
        throw new Error(message);
      } finally {
        setRunning(false);
      }
    },
    [sign],
  );

  const steps = useCallback(
    (labels: FlowLabels): TxStepView[] => {
      const err = (k: StepKey) => (failed?.step === k ? failed.message : undefined);
      // Không hiện bước báo giá: lỗi báo giá (vd. số dư không đủ) hiện ở bước ký đầu tiên.
      const quoteFailedHidden = !labels.quote && phase.quote === "error";
      return [
        ...(labels.quote ? [{ label: labels.quote, phase: phase.quote, error: err("quote") }] : []),
        ...(needPermit && labels.permit ? [{ label: labels.permit, phase: phase.permit, error: err("permit") }] : []),
        {
          label: labels.sign,
          phase: quoteFailedHidden ? ("error" as const) : phase.sign,
          error: err("sign") ?? (quoteFailedHidden ? err("quote") : undefined),
        },
        {
          label: labels.relay ?? "Gửi giao dịch",
          phase: phase.relay,
          hash,
          error: err("relay"),
        },
      ];
    },
    [failed, hash, needPermit, phase],
  );

  const active = running || Object.values(phase).some((p) => p !== "idle");
  return { run, steps, running, active };
}
