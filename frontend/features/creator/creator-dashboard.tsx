"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { Address } from "viem";
import { VOICE_CAMPAIGNS_ABI } from "@/lib/contracts";
import { formatDuration } from "@/lib/format";
import { moneyFromUnits } from "@/lib/money";
import { useCampaign, useCampaigns, useFx, useRevenue } from "@/hooks/queries";
import { useAddresses, useWithdrawable } from "@/hooks/useChain";
import { useContractTx } from "@/hooks/useContractTx";
import { useWalletSession } from "@/hooks/useSessions";
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

export function CreatorDashboard() {
  const w = useWalletSession();
  const campaigns = useCampaigns();
  const fx = useFx();
  const withdrawable = useWithdrawable(w.address as Address | undefined);
  const { vc } = useAddresses();
  const tx = useContractTx();
  const toast = useToast();
  const mine = (campaigns.data ?? []).filter((c) => c.creator.toLowerCase() === w.address?.toLowerCase());
  const owed = (withdrawable.data as bigint | undefined) ?? BigInt(0);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <Card tone="peach" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-caption">Phần doanh thu chưa rút (mọi chiến dịch của ví này)</p>
            {fx.data && withdrawable.data !== undefined ? <MoneyText value={moneyFromUnits(owed, fx.data.rate)} size="xl" /> : <Skeleton className="mt-2 h-10 w-48" />}
          </div>
          <Button
            disabled={owed === BigInt(0) || !vc}
            loading={tx.state.phase === "simulating" || tx.state.phase === "signing" || tx.state.phase === "pending"}
            onClick={async () => {
              try {
                await tx.run({ address: vc!, abi: VOICE_CAMPAIGNS_ABI, functionName: "withdraw", args: [], account: w.address as Address });
                await withdrawable.refetch();
                toast.success("Đã rút phần doanh thu về ví");
              } catch (e) {
                toast.error("Chưa rút được", e instanceof Error ? e.message : undefined);
              }
            }}
          >
            Rút về ví
          </Button>
        </Card>
        <ButtonLink href="/create/new" size="lg" className="h-full min-h-14" transitionTypes={["nav-forward"]}>+ Tạo chiến dịch mới</ButtonLink>
      </div>
      {tx.state.phase !== "idle" && <TxSteps steps={[{ label: "Rút phần doanh thu (withdraw)", phase: tx.state.phase, hash: tx.state.hash, error: tx.state.error }]} />}

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
  const w = useWalletSession();
  const detail = useCampaign(c.id);
  const revenue = useRevenue(c.id);
  const { vc } = useAddresses();
  const tx = useContractTx();
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
          <Button size="sm" variant="secondary" loading={tx.state.phase === "signing" || tx.state.phase === "pending"} onClick={async () => {
            try {
              await tx.run({ address: vc!, abi: VOICE_CAMPAIGNS_ABI, functionName: "withdrawSeed", args: [BigInt(c.id)], account: w.address as Address });
              await qc.invalidateQueries({ queryKey: ["campaign", c.id] });
              toast.success("Đã rút quỹ mồi còn dư");
            } catch (e) {
              toast.error("Chưa rút được quỹ mồi", e instanceof Error ? e.message : undefined);
            }
          }}>Rút quỹ mồi còn dư</Button>
        )}
      </div>
    </Card>
  );
}
