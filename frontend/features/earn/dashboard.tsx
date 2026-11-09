"use client";

import Link from "next/link";
import { formatDuration, formatNumber } from "@/lib/format";
import { useCampaigns } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";
import { ContributionStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedNumber, Reveal } from "@/components/ui/misc";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { DatasetCard } from "@/features/marketplace/dataset-card";
import { useMyContributions } from "@/features/earn/use-earn";
import { WalletBackupCard } from "@/features/earn/wallet-backup";

export function EarnDashboard() {
  const c = useContributor();
  const mine = useMyContributions();
  const campaigns = useCampaigns();
  if (mine.error) return <ErrorState className="mt-8" description={mine.error.message} onRetry={() => mine.refetch()} />;

  const items = mine.data?.contributions ?? [];
  const registered = items.filter((x) => x.status === "registered");
  const validSec = registered.reduce((n, x) => n + x.weight_sec, 0);
  const joined = new Set(items.map((x) => x.campaign_id)).size;
  const open = (campaigns.data ?? []).filter((x) => x.is_collecting).slice(0, 2);
  const name = c.session?.email.split("@")[0];

  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Reveal>
          <div className="relative h-full overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-primary via-[#1d4ed8] to-[#0e7490] p-7 text-white sm:p-8">
            <div aria-hidden className="absolute -right-10 -top-10 size-48 rounded-full bg-cyan/30 blur-3xl" />
            <p className="relative text-sm font-semibold text-[#bae6fd]">Xin chào{name ? `, ${name}` : ""}</p>
            <p className="relative mt-4 text-sm text-[#dbeafe]">Tiền chưa rút</p>
            <div className="relative mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
              {mine.data ? <AnimatedNumber value={mine.data.total_pending.vnd} format={(n) => `≈ ${formatNumber(Math.round(n))} ₫`} /> : <Skeleton className="h-12 w-56 bg-white/20" />}
            </div>
            <div className="relative mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/earn/campaigns" variant="secondary" className="!bg-white !text-primary-active hover:!bg-primary-soft">Ghi âm ngay</ButtonLink>
              <ButtonLink href="/earn/earnings" variant="ghost" className="!text-white hover:!bg-white/10">Rút tiền →</ButtonLink>
            </div>
          </div>
        </Reveal>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Giọng nói hợp lệ", value: validSec, fmt: (n: number) => formatDuration(Math.round(n)) },
            { label: "Bản ghi đã ghi nhận", value: registered.length, fmt: (n: number) => formatNumber(Math.round(n)) },
            { label: "Chiến dịch tham gia", value: joined, fmt: (n: number) => formatNumber(Math.round(n)) },
            { label: "Đang chờ duyệt", value: items.filter((x) => x.status === "gray" || x.status === "pending_chain").length, fmt: (n: number) => formatNumber(Math.round(n)) },
          ].map((s, i) => (
            <Reveal key={s.label} delay={0.05 * i}>
              <Card padding="sm" className="h-full">
                <p className="text-caption">{s.label}</p>
                <div className="mt-2 text-2xl font-bold tracking-tight">{mine.data ? <AnimatedNumber value={s.value} format={s.fmt} /> : <Skeleton className="h-7 w-16" />}</div>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>

      <WalletBackupCard />

      <section aria-labelledby="recent">
        <div className="flex items-center justify-between">
          <h2 id="recent" className="text-h3">Bản ghi gần đây</h2>
          <Link href="/earn/history" className="text-sm font-semibold text-primary hover:underline">Xem tất cả</Link>
        </div>
        <div className="mt-4">
          {mine.isLoading ? (
            <Skeleton className="h-40" />
          ) : items.length === 0 ? (
            <EmptyState title="Bạn chưa có bản ghi nào" description="Chọn một chiến dịch, ký đồng thuận và đọc câu mẫu đầu tiên — mỗi câu chỉ vài giây." action={<ButtonLink href="/earn/campaigns">Chọn chiến dịch</ButtonLink>} />
          ) : (
            <ul className="surface-card divide-y divide-line">
              {items.slice(-5).reverse().map((x) => (
                <li key={x.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-ink"><span className="line-clamp-1">“{x.prompt_text}”</span></p>
                  <div className="flex shrink-0 items-center gap-3 text-sm text-ink-muted">
                    {x.weight_sec > 0 && <span className="tabular">{x.weight_sec} giây</span>}
                    <ContributionStatusBadge status={x.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {open.length > 0 && (
        <section aria-labelledby="open-campaigns">
          <h2 id="open-campaigns" className="text-h3">Đang cần giọng nói</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {open.map((x) => <DatasetCard key={x.id} c={x} href={`/earn/campaigns/${x.id}`} cta="Tham gia" />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function EarnCampaigns() {
  const { data, error, isLoading, refetch } = useCampaigns();
  const open = (data ?? []).filter((x) => x.is_collecting);
  return (
    <div className="py-8">
      <h1 className="text-h2">Chọn chiến dịch để ghi âm</h1>
      <p className="mt-2 text-ink-muted">Mỗi chiến dịch cần một vùng giọng và chủ đề riêng. Bạn ký đồng thuận một lần cho mỗi chiến dịch.</p>
      <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <Skeleton className="h-72" />}
        {error && <ErrorState className="md:col-span-3" description={error.message} onRetry={() => refetch()} />}
        {data && open.length === 0 && <EmptyState className="md:col-span-3" title="Hiện chưa có chiến dịch đang thu thập" description="Quay lại sau nhé — chiến dịch mới xuất hiện khi có bên đặt hàng dữ liệu." />}
        {open.map((x) => <DatasetCard key={x.id} c={x} href={`/earn/campaigns/${x.id}`} cta="Tham gia" />)}
      </div>
    </div>
  );
}
