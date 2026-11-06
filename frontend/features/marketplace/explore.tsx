"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { CampaignSummary } from "@/types/api";
import { daysLeft, formatDuration } from "@/lib/format";
import { useCampaigns } from "@/hooks/queries";
import { CampaignStatusBadge, Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { MoneyText } from "@/components/money";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { DatasetCard, VoiceSignature } from "@/features/marketplace/dataset-card";
import { accentLabel, campaignName } from "@/features/marketplace/labels";
import { PriceCurve } from "@/features/marketplace/price-curve";

type StatusFilter = "all" | "collecting" | "done";
type Sort = "progress" | "newest" | "price-asc" | "price-desc";

export function Explore() {
  const { data, error, isLoading, refetch } = useCampaigns();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [accent, setAccent] = useState("all");
  const [sort, setSort] = useState<Sort>("progress");

  const accents = useMemo(() => [...new Set((data ?? []).map((c) => c.accent).filter(Boolean) as string[])], [data]);
  const list = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    const xs = (data ?? []).filter(
      (c) =>
        (status === "all" || (status === "collecting" ? c.is_collecting : !c.is_collecting)) &&
        (accent === "all" || c.accent === accent) &&
        (!q || campaignName(c).toLowerCase().includes(q) || accentLabel(c.accent).toLowerCase().includes(q)),
    );
    const by: Record<Sort, (a: CampaignSummary, b: CampaignSummary) => number> = {
      progress: (a, b) => b.progress_bps - a.progress_bps,
      newest: (a, b) => b.id - a.id,
      "price-asc": (a, b) => a.price.units - b.price.units,
      "price-desc": (a, b) => b.price.units - a.price.units,
    };
    return xs.sort(by[sort]);
  }, [data, deferred, status, accent, sort]);

  const spotlight = sort === "progress" && status !== "done" && !deferred && list.length > 1 ? list.find((c) => c.is_collecting) : undefined;
  const rest = spotlight ? list.filter((c) => c.id !== spotlight.id) : list;
  const count = (f: StatusFilter) => (data ?? []).filter((c) => f === "all" || (f === "collecting" ? c.is_collecting : !c.is_collecting)).length;

  return (
    <div className="container-page">
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-soft)] lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
          <Input type="search" placeholder="Tìm theo tên hoặc vùng giọng…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" aria-label="Tìm bộ dữ liệu" />
        </div>
        <Tabs
          label="Lọc theo trạng thái"
          value={status}
          onChange={setStatus}
          items={[
            { value: "all", label: "Tất cả", count: count("all") },
            { value: "collecting", label: "Đang thu thập", count: count("collecting") },
            { value: "done", label: "Đã ngừng thu thập", count: count("done") },
          ]}
        />
        <div className="grid grid-cols-2 gap-3 lg:w-[22rem]">
          <Select value={accent} onChange={(e) => setAccent(e.target.value)} aria-label="Vùng giọng">
            <option value="all">Mọi vùng giọng</option>
            {accents.map((a) => <option key={a} value={a}>{accentLabel(a)}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
            <option value="progress">Tiến độ cao nhất</option>
            <option value="newest">Mới nhất</option>
            <option value="price-asc">Giá thấp → cao</option>
            <option value="price-desc">Giá cao → thấp</option>
          </Select>
        </div>
      </div>

      <p className="mt-6 text-sm text-ink-muted" aria-live="polite">{data ? `${list.length} bộ dữ liệu` : " "}</p>

      {error && <ErrorState className="mt-4" description={error.message} onRetry={() => refetch()} />}
      {isLoading && <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} lines={4} />)}</div>}
      {data && list.length === 0 && (
        <EmptyState className="mt-4" title="Không có bộ dữ liệu phù hợp" description="Thử bỏ bớt bộ lọc, hoặc đặt hàng một bộ dữ liệu mới theo đúng nhu cầu của bạn." action={<ButtonLink href="/create/new" variant="outline">Tạo chiến dịch</ButtonLink>} />
      )}

      {spotlight && <Spotlight c={spotlight} />}

      <motion.ul layout className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {rest.map((c) => (
            <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }}>
              <DatasetCard c={c} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

/** Thẻ nổi bật nằm ngang: phá nhịp lưới, kể rõ câu chuyện "mua sớm, giá rẻ". */
function Spotlight({ c }: { c: CampaignSummary }) {
  return (
    <Link
      href={`/datasets/${c.id}`}
      transitionTypes={["nav-forward"]}
      className="group mt-4 grid overflow-hidden rounded-[1.5rem] border border-primary-line bg-gradient-to-br from-primary-soft via-surface to-cyan-soft shadow-[var(--shadow-soft)] transition-[box-shadow,transform] duration-[var(--duration-hover)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] md:grid-cols-[1.2fr_1fr]"
    >
      <div className="flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <Badge tone="primary">Nổi bật</Badge>
          <Badge tone="cyan">{accentLabel(c.accent)}</Badge>
          <CampaignStatusBadge status={c.status} />
        </div>
        <h2 className="text-h2 group-hover:text-primary-active">{campaignName(c)}</h2>
        <VoiceSignature seed={c.id} bars={40} className="h-14" />
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <b>{(c.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% · {formatDuration(c.total_sec)}</b>
            <span className="text-ink-muted">mục tiêu {formatDuration(c.target_sec)} · còn {daysLeft(c.deadline)} ngày</span>
          </div>
          <Progress value={c.progress_bps / 10_000} label={`Tiến độ ${campaignName(c)}`} />
        </div>
        <div className="flex items-end justify-between">
          <MoneyText value={c.price} size="xl" />
          <span className="font-semibold text-primary">Xem chi tiết →</span>
        </div>
      </div>
      <div className="hidden border-l border-primary-line/60 bg-surface/70 p-6 md:block">
        <p className="text-label">Giá tăng theo tiến độ</p>
        <PriceCurve progressBps={c.progress_bps} fullVnd={c.full_price.vnd} />
      </div>
    </Link>
  );
}
