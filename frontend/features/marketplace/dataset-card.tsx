import Link from "next/link";
import type { CampaignSummary } from "@/types/api";
import { cn } from "@/lib/cn";
import { daysLeft, formatDuration } from "@/lib/format";
import { CampaignStatusBadge, Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/money";
import { Progress } from "@/components/ui/progress";
import { accentLabel, campaignName } from "@/features/marketplace/labels";

/** Chiều cao các thanh: LCG tất định theo seed (hàm thuần, ngoài render). */
function signatureHeights(seed: number, bars: number): number[] {
  const out: number[] = [];
  let x = ((seed + 1) * 2654435761) >>> 0;
  for (let i = 0; i < bars; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out.push(20 + (x % 80));
  }
  return out;
}

/** "Chữ ký sóng âm" tất định theo id: mỗi bộ dữ liệu có hình nhận diện riêng. */
export function VoiceSignature({ seed, bars = 28, className }: { seed: number; bars?: number; className?: string }) {
  const heights = signatureHeights(seed, bars);
  return (
    <div className={cn("flex h-12 items-end gap-[3px]", className)} aria-hidden>
      {heights.map((h, i) => (
        <span key={i} className="w-full rounded-full bg-gradient-to-t from-primary/70 to-cyan/70" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export function DatasetCard({ c, href = `/datasets/${c.id}`, cta }: { c: CampaignSummary; href?: string; cta?: string }) {
  const progress = c.progress_bps / 10_000;
  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-[var(--duration-hover)] ease-[var(--ease-soft)] hover:-translate-y-1 hover:border-primary-line hover:shadow-[var(--shadow-lift)] focus-visible:shadow-[var(--shadow-ring)]"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone="cyan">{accentLabel(c.accent)}</Badge>
        <CampaignStatusBadge status={c.status} />
      </div>
      <VoiceSignature seed={c.id} className="mt-5 transition-opacity duration-[var(--duration-hover)] group-hover:opacity-100 opacity-80" />
      <h3 className="mt-4 line-clamp-2 text-lg font-semibold leading-snug text-ink group-hover:text-primary-active">{campaignName(c)}</h3>
      {!c.metadata_verified && <p className="mt-1 text-xs text-warning-ink">Metadata chưa được xác minh</p>}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-ink">{(c.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</span>
          <span className="text-ink-muted">
            {formatDuration(c.total_sec)} / {formatDuration(c.target_sec)}
          </span>
        </div>
        <Progress value={progress} label={`Tiến độ ${campaignName(c)}`} size="sm" />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-caption">Giá hiện tại</p>
          <MoneyText value={c.price} size="lg" />
        </div>
        <span className="text-right text-caption">
          {c.is_collecting ? `Còn ${daysLeft(c.deadline)} ngày` : "Vẫn mở bán"}
          {cta && <span className="mt-1 block font-semibold text-primary">{cta} →</span>}
        </span>
      </div>
    </Link>
  );
}
