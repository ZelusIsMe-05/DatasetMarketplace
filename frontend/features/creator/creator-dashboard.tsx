"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { Address } from "viem";
import { formatDuration } from "@/lib/format";
import { moneyFromUnits } from "@/lib/money";
import { useCampaign, useCampaigns, useFees, useFx, useRevenue } from "@/hooks/queries";
import { useWithdrawable } from "@/hooks/useChain";
import { useWalletSession } from "@/hooks/useSessions";
import { useSponsoredFlow } from "@/hooks/useSponsored";
import { publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import type { CampaignSummary } from "@/types/api";
import { CampaignStatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MoneyText } from "@/components/money";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { TxSteps } from "@/components/tx/tx-steps";
import { campaignName } from "@/features/marketplace/labels";
import { CampaignDataPanel } from "@/features/creator/campaign-data";

export function CreatorDashboard() {
  const w = useWalletSession();
  const campaigns = useCampaigns();
  const fx = useFx();
  const fees = useFees();
  const withdrawable = useWithdrawable(w.address as Address | undefined);
  const flow = useSponsoredFlow();
  const toast = useToast();
  const mine = (campaigns.data ?? []).filter((c) => c.creator.toLowerCase() === w.address?.toLowerCase());
  const owed = (withdrawable.data as bigint | undefined) ?? BigInt(0);
  const feeUnits = BigInt(fees.data?.withdraw.units ?? 0);

  const withdraw = async () => {
    const account = w.address;
    if (!account) return;
    try {
      const res = await flow.run(
        () => publicApi.withdrawQuote(account),
        (s) => publicApi.withdraw({ account, fee: s.fee, deadline: s.deadline, signature: s.signature }),
      );
      await withdrawable.refetch();
      toast.success("Đã rút phần doanh thu về ví", `${res.amount.display} (phí xử lý ${res.fee.display})`);
    } catch (e) {
      toast.error("Chưa rút được", (e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <Card tone="peach" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-caption">Phần doanh thu chưa rút (mọi chiến dịch của ví này)</p>
            {fx.data && withdrawable.data !== undefined ? <MoneyText value={moneyFromUnits(owed, fx.data.rate)} size="xl" /> : <Skeleton className="mt-2 h-10 w-48" />}
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <Button disabled={owed <= feeUnits || !fees.data} loading={flow.running} onClick={withdraw}>
              Rút về ví
            </Button>
            <p className="text-caption">Phí xử lý {fees.data?.withdraw.display ?? "…"}</p>
          </div>
        </Card>
        <ButtonLink href="/create/new" size="lg" className="h-full min-h-14" transitionTypes={["nav-forward"]}>+ Tạo chiến dịch mới</ButtonLink>
      </div>
      {flow.active && <TxSteps steps={flow.steps({ sign: "Ký yêu cầu rút doanh thu (miễn phí)" })} />}

      <section aria-labelledby="mine">
        <h2 id="mine" className="text-h3">Chiến dịch của bạn</h2>
        <div className="mt-4 grid gap-5">
          {campaigns.isLoading && <Skeleton className="h-40" />}
          {campaigns.error && <ErrorState description={campaigns.error.message} onRetry={() => campaigns.refetch()} />}
          {campaigns.data && mine.length === 0 && <EmptyState title="Ví này chưa tạo chiến dịch nào" description="Đặt hàng bộ dữ liệu giọng nói đầu tiên: mô tả nhu cầu, bộ câu mẫu, giá và hạn thu thập." action={<ButtonLink href="/create/new">Tạo chiến dịch</ButtonLink>} />}
          {mine.map((c) => <CreatorCampaignRow key={c.id} c={c} />)}
        </div>
      </section>
    </div>
  );
}

function CreatorCampaignRow({ c }: { c: CampaignSummary }) {
  const detail = useCampaign(c.id);
  const revenue = useRevenue(c.id);
  const flow = useSponsoredFlow();
  const qc = useQueryClient();
  const toast = useToast();
  const seedLeft = detail.data?.seed_balance.units ?? 0;
  // Hợp đồng dùng thời gian block; mô phỏng giao dịch sẽ báo "Chưa đến hạn" nếu chưa qua deadline.
  const canWithdrawSeed = seedLeft > 0 && !c.is_collecting;
  return (
    <Card className="grid gap-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><CampaignStatusBadge status={c.status} /><span className="text-caption">#{c.id}</span></div>
        <Link href={`/datasets/${c.id}`} className="mt-2 block text-lg font-semibold hover:text-primary-active">{campaignName(c)}</Link>
        <Progress value={c.progress_bps / 10_000} label="Tiến độ" size="sm" className="mt-3" />
        <p className="mt-2 text-caption">{formatDuration(c.total_sec)} / {formatDuration(c.target_sec)} · giá hiện tại {c.price.display}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-caption">Doanh thu</dt><dd className="font-semibold">{revenue.data?.total.display ?? "…"}</dd></div>
        <div><dt className="text-caption">Số lần bán</dt><dd className="font-semibold">{revenue.data?.sales ?? "…"}</dd></div>
        <div><dt className="text-caption">Phần của bạn</dt><dd className="font-semibold">{revenue.data?.to_creator.display ?? "…"}</dd></div>
        <div><dt className="text-caption">Quỹ mồi còn</dt><dd className="font-semibold">{detail.data?.seed_balance.display ?? "…"}</dd></div>
      </dl>
      <div className="flex flex-col gap-2">
        <ButtonLink href={`/datasets/${c.id}`} variant="outline" size="sm">Xem trang dataset</ButtonLink>
        {canWithdrawSeed && (
          <Button size="sm" variant="secondary" loading={flow.running} onClick={async () => {
            try {
              const res = await flow.run(
                () => publicApi.seedQuote(c.id),
                (s) => publicApi.withdrawSeed(c.id, { fee: s.fee, deadline: s.deadline, signature: s.signature }),
              );
              await qc.invalidateQueries({ queryKey: ["campaign", c.id] });
              toast.success("Đã rút quỹ mồi còn dư", `${res.amount.display} (phí xử lý ${res.fee.display})`);
            } catch (e) {
              toast.error("Chưa rút được quỹ mồi", (e as Error).message);
            }
          }}>Rút quỹ mồi còn dư</Button>
        )}
      </div>
      {flow.active && <TxSteps className="lg:col-span-3" steps={flow.steps({ sign: "Ký yêu cầu rút quỹ mồi (miễn phí)" })} />}
      <CampaignDataPanel c={c} detail={detail.data} />
    </Card>
  );
}
