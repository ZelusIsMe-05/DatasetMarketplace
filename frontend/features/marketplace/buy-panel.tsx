"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { describeChainError } from "@/lib/chainErrors";
import { network } from "@/lib/config";
import { formatVnd, moneyFromUnits } from "@/lib/money";
import { qk, useFees, useFx, useLicense, usePrice } from "@/hooks/queries";
import { useTokenBalance } from "@/hooks/useChain";
import { useAccountWallet } from "@/hooks/useSessions";
import { useSponsoredFlow } from "@/hooks/useSponsored";
import { publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/money";
import { Skeleton } from "@/components/ui/states";
import { TxSteps } from "@/components/tx/tx-steps";
import { WalletStatus } from "@/features/auth/wallet-status";
import { DownloadPanel } from "@/features/marketplace/download-panel";

/**
 * Mua license: người mua chỉ ký (cho phép trừ mUSDC + Buy) trong MetaMask/Core; nền tảng gửi giao dịch và trả phí
 * mạng, thu phí xử lý bằng mUSDC trong cùng giao dịch. Không cần AVAX/ETH trong ví.
 */
export function BuyPanel({ campaignId }: { campaignId: number }) {
  // Người mua = tài khoản đang đăng nhập; chỉ ký được khi MetaMask đang chọn đúng ví đã gắn với Gmail (§3 #27).
  const aw = useAccountWallet();
  const address = aw.account && aw.metamask === "ready" ? (aw.address as Address) : undefined;
  const qc = useQueryClient();
  const toast = useToast();
  const fx = useFx();
  const fees = useFees();
  const price = usePrice(campaignId);
  const license = useLicense(campaignId, address);
  const balance = useTokenBalance(address);
  const flow = useSponsoredFlow();
  const [fauceting, setFauceting] = useState(false);

  if (!price.data) return <Skeleton className="h-64" />;
  const q = price.data;
  const priceUnits = BigInt(q.price.units);
  const rate = fx.data?.rate ?? 0;
  const fee = fees.data?.buy;
  const totalUnits = fee ? priceUnits + BigInt(fee.units) : undefined;
  const enough = balance.data !== undefined && totalUnits !== undefined && (balance.data as bigint) >= totalUnits;

  const buy = async () => {
    if (!address) return;
    try {
      await flow.run(
        () => publicApi.buyQuote(campaignId, address),
        (signed, quote) => publicApi.buy(campaignId, { ...signed, buyer: address, max_price: quote.amount.units }),
        async (quote) => {
          // Bảo vệ người mua: không ký nếu giá vừa tăng so với giá đang hiển thị.
          if (BigInt(quote.amount.units) > priceUnits) {
            await price.refetch();
            throw new Error(`Giá vừa tăng lên ${quote.amount.display} — hãy xem lại rồi bấm mua lại`);
          }
        },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.license(campaignId, address) }),
        qc.invalidateQueries({ queryKey: qk.campaign(campaignId) }),
        qc.invalidateQueries({ queryKey: qk.campaigns }),
        qc.invalidateQueries({ queryKey: qk.revenue(campaignId) }),
        balance.refetch(),
      ]);
      toast.success("Đã mua license", "Bạn có thể tải phiên bản hiện tại và mọi bản cập nhật sau này.");
    } catch (e) {
      toast.error("Chưa mua được", (e as Error).message);
    }
  };

  const steps = flow.steps({ permit: "Ký cho phép trừ mUSDC (miễn phí)", sign: "Ký mua license (miễn phí)" });

  return (
    <div className="surface-card flex flex-col gap-5 p-6">
      <div>
        <p className="text-caption">Giá hiện tại · {(q.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% tiến độ</p>
        <MoneyText value={q.price} size="xl" className="mt-1" />
        <p className="mt-2 text-caption">Giá đầy đủ {q.full_price.display}. Giá do hợp đồng tính tại thời điểm mua; bạn ký với mức tối đa đúng bằng giá đang hiển thị.</p>
      </div>

      {!address ? (
        <div className="flex flex-col gap-2">
          <WalletStatus purpose="mua bộ dữ liệu" compact />
          <p className="text-caption">Người mua dùng ví Core hoặc MetaMask đã gắn với Gmail, chỉ cần ký — không cần AVAX.</p>
        </div>
      ) : license.data?.licensed ? (
        <DownloadPanel campaignId={campaignId} license={license.data} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-sm" aria-label="Hóa đơn mua">
            <dt className="text-ink-muted">Số dư của bạn</dt>
            <dd className="text-right font-semibold tabular">{balance.data !== undefined && rate ? moneyFromUnits(balance.data as bigint, rate, "mUSDC").display : "…"}</dd>
            <dt className="text-ink-muted">Giá bộ dữ liệu</dt>
            <dd className="text-right font-semibold tabular">{q.price.display}</dd>
            <dt className="text-ink-muted">
              Phí xử lý
            </dt>
            <dd className="text-right font-semibold tabular">{fee?.display ?? "…"}</dd>
            <dt className="border-t border-line pt-3 font-semibold text-ink">Tổng thanh toán</dt>
            <dd className="border-t border-line pt-3 text-right font-bold tabular">{fee ? `≈ ${formatVnd(q.price.vnd + fee.vnd)}` : "…"}</dd>
          </dl>
          {!q.can_buy && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">{q.reason}</p>}
          {q.can_buy && !enough && balance.data !== undefined && network.allowFaucet && (
            <Button
              variant="secondary"
              loading={fauceting}
              onClick={async () => {
                setFauceting(true);
                try {
                  const r = await publicApi.faucet(address as Address);
                  await balance.refetch();
                  toast.success("Đã nhận mUSDC thử nghiệm", r.minted.display);
                } catch (e) {
                  toast.error("Không nhận được mUSDC", describeChainError(e));
                } finally {
                  setFauceting(false);
                }
              }}
            >
              Nhận mUSDC thử nghiệm
            </Button>
          )}
          <Button size="lg" onClick={buy} loading={flow.running} disabled={!q.can_buy || !enough || flow.running}>
            Mua license · {fee ? `≈ ${formatVnd(q.price.vnd + fee.vnd)}` : q.price.display}
          </Button>
          {flow.active && <TxSteps steps={steps} />}
        </>
      )}
    </div>
  );
}
