"use client";

import { useCampaigns } from "@/hooks/queries";
import { formatDuration, formatNumber } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { AnimatedNumber, Reveal, SectionHeading } from "@/components/ui/misc";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { DatasetCard } from "@/features/marketplace/dataset-card";

/** Số liệu thật từ API (không dùng con số trang trí). */
export function LiveStats() {
  const { data } = useCampaigns();
  const collecting = data?.filter((c) => c.is_collecting).length ?? 0;
  const totalSec = data?.reduce((n, c) => n + c.total_sec, 0) ?? 0;
  const stats = [
    { label: "Chiến dịch đang thu thập", value: collecting, fmt: (n: number) => formatNumber(Math.round(n)) },
    { label: "Giọng nói hợp lệ đã ghi nhận", value: totalSec, fmt: (n: number) => formatDuration(Math.round(n)) },
    { label: "Tổng số chiến dịch", value: data?.length ?? 0, fmt: (n: number) => formatNumber(Math.round(n)) },
  ];
  return (
    <section aria-label="Số liệu trực tiếp" className="container-page relative z-10 -mt-6 sm:-mt-10">
      <div className="surface-card grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 px-6 py-5">
            <span className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {data ? <AnimatedNumber value={s.value} format={s.fmt} /> : <span className="skeleton inline-block h-8 w-20 align-middle" />}
            </span>
            <span className="text-sm text-ink-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FeaturedCampaigns() {
  const { data, isLoading, error, refetch } = useCampaigns();
  const top = [...(data ?? [])].sort((a, b) => Number(b.is_collecting) - Number(a.is_collecting) || b.progress_bps - a.progress_bps).slice(0, 3);
  return (
    <section className="container-page py-20 sm:py-24" aria-labelledby="featured">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <Reveal>
          <SectionHeading eyebrow="Chiến dịch nổi bật" title={<span id="featured">Đang cần giọng nói của bạn</span>} />
        </Reveal>
        <ButtonLink href="/explore" variant="ghost">Xem tất cả →</ButtonLink>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={4} />)}
        {error && <ErrorState className="md:col-span-3" description={error.message} onRetry={() => refetch()} title="Chưa tải được chiến dịch" />}
        {data && top.length === 0 && <EmptyState className="md:col-span-3" title="Chưa có chiến dịch nào" description="Hãy là người đầu tiên đặt hàng một bộ dữ liệu giọng nói." action={<ButtonLink href="/create/new">Tạo chiến dịch</ButtonLink>} />}
        {top.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.07} className="h-full">
            <DatasetCard c={c} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
