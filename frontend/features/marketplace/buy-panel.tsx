"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { network } from "@/lib/config";
import { TOKEN_ABI, VOICE_CAMPAIGNS_ABI } from "@/lib/contracts";
import { moneyFromUnits } from "@/lib/money";
import { qk, useFx, useLicense, usePrice } from "@/hooks/queries";
import { useAddresses, useAllowance, useTokenBalance } from "@/hooks/useChain";
import { useContractTx } from "@/hooks/useContractTx";
import { publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/money";
import { Skeleton } from "@/components/ui/states";
import { TxSteps, type TxStepView } from "@/components/tx/tx-steps";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { DownloadPanel } from "@/features/marketplace/download-panel";

export function BuyPanel({ campaignId }: { campaignId: number }) {
  const { address, chainId } = useAccount();
  const config = useConfig();
  const qc = useQueryClient();
  const toast = useToast();
  const { vc, token } = useAddresses();
  const fx = useFx();
  const price = usePrice(campaignId);
  const license = useLicense(campaignId, address);
  const balance = useTokenBalance(address);
  const allowance = useAllowance(address);
  const approveTx = useContractTx();
  const buyTx = useContractTx();
  const [running, setRunning] = useState(false);
  const [needApprove, setNeedApprove] = useState(false);
  const [fauceting, setFauceting] = useState(false);

  if (!price.data) return <Skeleton className="h-64" />;
  const q = price.data;
  const priceUnits = BigInt(q.price.units);
  const rate = fx.data?.rate ?? 0;
  const enough = balance.data !== undefined && (balance.data as bigint) >= priceUnits;

  const buy = async () => {
    if (!address || !vc || !token) return;
    setRunning(true);
    approveTx.reset();
    buyTx.reset();
    try {
      // Giá đọc lại ngay trước khi mua; maxPrice = giá người dùng đang thấy (bảo vệ khi tiến độ đổi).
      const live = (await readContract(config, { address: vc, abi: VOICE_CAMPAIGNS_ABI, functionName: "currentPrice", args: [BigInt(campaignId)] })) as bigint;
      const maxPrice = live > priceUnits ? priceUnits : live;
      const allowed = (await readContract(config, { address: token, abi: TOKEN_ABI, functionName: "allowance", args: [address, vc] })) as bigint;
      setNeedApprove(allowed < maxPrice);
      if (allowed < maxPrice) {
        await approveTx.run({ address: token, abi: TOKEN_ABI, functionName: "approve", args: [vc, maxPrice], account: address });
      }
      await buyTx.run({ address: vc, abi: VOICE_CAMPAIGNS_ABI, functionName: "buy", args: [BigInt(campaignId), maxPrice], account: address });
      await publicApi.sync().catch(() => undefined);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.license(campaignId, address) }),
        qc.invalidateQueries({ queryKey: qk.campaign(campaignId) }),
        qc.invalidateQueries({ queryKey: qk.campaigns }),
        qc.invalidateQueries({ queryKey: qk.revenue(campaignId) }),
        balance.refetch(),
        allowance.refetch(),
      ]);
      toast.success("Đã mua license", "Bạn có thể tải phiên bản hiện tại và mọi bản cập nhật sau này.");
    } catch (e) {
      toast.error("Chưa mua được", e instanceof Error ? e.message : undefined);
    } finally {
      setRunning(false);
    }
  };

  const steps: TxStepView[] = [
    ...(needApprove ? [{ label: "Cho phép hợp đồng dùng mUSDC", phase: approveTx.state.phase, hash: approveTx.state.hash, error: approveTx.state.error }] : []),
    { label: "Mua license bộ dữ liệu", phase: needApprove && approveTx.state.phase !== "success" ? ("waiting" as const) : buyTx.state.phase, hash: buyTx.state.hash, error: buyTx.state.error },
  ];
  const showSteps = running || approveTx.state.phase !== "idle" || buyTx.state.phase !== "idle";

  return (
    <div className="surface-card flex flex-col gap-5 p-6">
      <div>
        <p className="text-caption">Giá hiện tại · {(q.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% tiến độ</p>
        <MoneyText value={q.price} size="xl" className="mt-1" />
        <p className="mt-2 text-caption">Giá đầy đủ {q.full_price.display}. Giá do hợp đồng tính tại thời điểm mua; bạn ký với mức tối đa đúng bằng giá đang hiển thị.</p>
      </div>

      {!address || chainId !== network.chain.id ? (
        <div className="flex flex-col gap-2">
          <ConnectWallet fullWidth />
          <p className="text-caption">Người mua dùng ví Core hoặc MetaMask và tự trả phí mạng (AVAX).</p>
        </div>
      ) : license.data?.licensed ? (
        <DownloadPanel campaignId={campaignId} license={license.data} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-sm">
            <dt className="text-ink-muted">Số dư của bạn</dt>
            <dd className="text-right font-semibold tabular">{balance.data !== undefined && rate ? moneyFromUnits(balance.data as bigint, rate, "mUSDC").display : "…"}</dd>
            <dt className="text-ink-muted">Cần thanh toán</dt>
            <dd className="text-right font-semibold tabular">{q.price.display}</dd>
          </dl>
          {!q.can_buy && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">{q.reason}</p>}
          {q.can_buy && !enough && network.allowFaucet && (
            <Button
              variant="secondary"
              loading={fauceting}
              onClick={async () => {
                setFauceting(true);
                try {
                  const r = await publicApi.faucet(address as Address);
                  await balance.refetch();
                  toast.success("Đã nhận mUSDC thử nghiệm", `${r.minted.display} (${r.minted.token})`);
                } catch (e) {
                  toast.error("Không nhận được mUSDC", e instanceof Error ? e.message : undefined);
                } finally {
                  setFauceting(false);
                }
              }}
            >
              Nhận mUSDC thử nghiệm
            </Button>
          )}
          <Button size="lg" onClick={buy} loading={running} disabled={!q.can_buy || !enough}>
            Mua license · {q.price.display}
          </Button>
          {showSteps && <TxSteps steps={steps} />}
        </>
      )}
    </div>
  );
}
