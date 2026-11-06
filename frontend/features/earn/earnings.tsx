"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { signTyped } from "@/lib/browserWallet";
import { formatDuration, formatNumber } from "@/lib/format";
import { moneyFromUnits } from "@/lib/money";
import { qk, useCampaigns, useFx } from "@/hooks/queries";
import { useTokenBalance } from "@/hooks/useChain";
import { useContributor } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { MoneyText } from "@/components/money";
import { AnimatedNumber } from "@/components/ui/misc";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { TxSteps, type TxStepView } from "@/components/tx/tx-steps";
import { campaignName } from "@/features/marketplace/labels";
import { useMyContributions } from "@/features/earn/use-earn";

export function Earnings() {
  const c = useContributor();
  const mine = useMyContributions();
  const campaigns = useCampaigns();
  const fx = useFx();
  const balance = useTokenBalance(c.address as Address | undefined);
  const [claimFor, setClaimFor] = useState<number | null>(null);
  if (mine.error) return <ErrorState className="mt-8" description={mine.error.message} onRetry={() => mine.refetch()} />;
  const nameOf = (id: number) => {
    const x = campaigns.data?.find((k) => k.id === id);
    return x ? campaignName(x) : `Chiến dịch #${id}`;
  };
  const earnings = mine.data?.earnings ?? [];

  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2">Thu nhập</h1>
        <p className="mt-2 text-ink-muted">Tiền chưa rút nằm trong hợp đồng và luôn là của bạn. Rút qua nền tảng thì không cần AVAX, chỉ trừ một khoản phí nhỏ.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card tone="soft">
          <p className="text-caption">Tổng tiền chưa rút</p>
          <div className="mt-1 text-3xl font-bold tracking-tight">{mine.data ? <AnimatedNumber value={mine.data.total_pending.vnd} format={(n) => `≈ ${formatNumber(Math.round(n))} ₫`} /> : <Skeleton className="h-9 w-48" />}</div>
          <p className="text-xs text-ink-muted">{mine.data?.total_pending.token}</p>
        </Card>
        <Card>
          <p className="text-caption">Đã về ví của bạn (on-chain)</p>
          {balance.data !== undefined && fx.data ? <MoneyText value={moneyFromUnits(balance.data as bigint, fx.data.rate, "mUSDC")} size="lg" className="mt-1" /> : <Skeleton className="mt-2 h-9 w-40" />}
        </Card>
      </div>
      {mine.isLoading && <Skeleton className="h-40" />}
      {mine.data && earnings.length === 0 && <EmptyState title="Chưa có thu nhập" description="Khi bản ghi của bạn được ghi nhận và dataset được bán, tiền sẽ xuất hiện ở đây." />}
      {earnings.length > 0 && (
        <ul className="grid gap-4">
          {earnings.map((e) => (
            <li key={e.campaign_id}>
              <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">{nameOf(e.campaign_id)}</p>
                  <p className="text-caption">{formatDuration(e.active_weight_sec)} giọng nói còn hiệu lực</p>
                </div>
                <div className="flex items-center gap-4">
                  <MoneyText value={e.pending} size="lg" align="right" />
                  <Button onClick={() => setClaimFor(e.campaign_id)} disabled={e.pending.units === 0}>Rút tiền</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ClaimDialog campaignId={claimFor} onClose={() => setClaimFor(null)} onDone={() => balance.refetch()} />
    </div>
  );
}

function ClaimDialog({ campaignId, onClose, onDone }: { campaignId: number | null; onClose: () => void; onDone: () => void }) {
  const c = useContributor();
  const qc = useQueryClient();
  const toast = useToast();
  const [steps, setSteps] = useState<TxStepView[] | null>(null);
  const quote = useQuery({
    queryKey: ["claim-quote", campaignId, c.address],
    queryFn: () => c.api!.claimQuote(campaignId!),
    enabled: campaignId !== null && Boolean(c.api),
    staleTime: 0,
  });
  const busy = steps?.some((s) => s.phase === "signing" || s.phase === "pending") ?? false;
  const done = steps?.at(-1)?.phase === "success";
  const close = () => {
    if (busy) return;
    setSteps(null);
    onClose();
  };

  const claim = async () => {
    if (campaignId === null || !c.api || !c.account) return;
    const set = (a: TxStepView["phase"], b: TxStepView["phase"], extra: Partial<TxStepView> = {}) =>
      setSteps([{ label: "Ký yêu cầu rút (chấp nhận phí tối đa)", phase: a }, { label: "Nền tảng gửi giao dịch rút tiền", phase: b, note: "Phí mạng AVAX do nền tảng trả", ...extra }]);
    try {
      set("signing", "waiting");
      const fresh = await c.api.claimQuote(campaignId); // lấy nonce/deadline mới nhất
      if (!fresh.can_claim || !fresh.sign) throw new Error(fresh.reason ?? "Không có tiền để rút");
      const sig = await signTyped(c.account, fresh.sign);
      set("success", "pending");
      const res = await c.api.claim(campaignId, Number(fresh.sign.typed_data.message.maxFee), fresh.sign.deadline, sig);
      set("success", "success", { hash: res.tx_hash, note: `Đã nhận ${res.received.display}` });
      await qc.invalidateQueries({ queryKey: qk.mine(c.address ?? undefined) });
      onDone();
      toast.success("Đã rút tiền về ví", `${res.received.display} (phí ${res.fee.display})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi";
      setSteps((s) => s?.map((x) => (x.phase === "signing" || x.phase === "pending" ? { ...x, phase: "error", error: msg } : x)) ?? null);
    }
  };

  const q = quote.data;
  return (
    <Dialog
      open={campaignId !== null}
      onClose={close}
      dismissible={!busy}
      size="sm"
      title="Rút tiền về ví"
      description="Bạn chỉ cần ký — không cần AVAX."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>{done ? "Đóng" : "Hủy"}</Button>
          {!done && <Button onClick={claim} loading={busy} disabled={!q?.can_claim}>Ký & rút {q?.net.display}</Button>}
        </>
      }
    >
      {quote.isLoading && <Skeleton className="h-32" />}
      {quote.error && <ErrorState description={quote.error.message} />}
      {q && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-y-3 rounded-2xl bg-canvas p-4 text-sm">
            <dt className="text-ink-muted">Tiền chưa rút</dt><dd className="text-right font-semibold tabular">{q.pending.display}</dd>
            <dt className="text-ink-muted">Phí rút hộ (tối đa)</dt><dd className="text-right font-semibold tabular">− {q.fee.display}</dd>
            <dt className="border-t border-line pt-3 font-semibold text-ink">Bạn nhận</dt><dd className="border-t border-line pt-3 text-right text-lg font-bold tabular">{q.net.display}</dd>
          </dl>
          {!q.can_claim && <p className="text-sm text-warning-ink">{q.reason}</p>}
          <p className="text-caption">Phí được ký kèm mức tối đa nên không thể bị tăng sau khi bạn ký. Số tiền có thể chênh vài đồng do làm tròn.</p>
          {steps && <TxSteps steps={steps} />}
        </div>
      )}
    </Dialog>
  );
}
