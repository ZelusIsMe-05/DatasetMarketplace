"use client";

import { use, useState } from "react";
import { API_URL } from "@/lib/config";
import { formatDate, formatDuration, shortHex } from "@/lib/format";
import { useCampaign, useTerms } from "@/hooks/queries";
import { AudioPlayer } from "@/components/audio/audio-player";
import { Badge, CampaignStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MoneyText } from "@/components/money";
import { TermsText } from "@/components/terms-text";
import { buttonClass } from "@/components/ui/button";
import { AnimatedNumber, CopyButton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/ui/progress";
import { ErrorState, LoadingBlock, Skeleton, SkeletonCard } from "@/components/ui/states";
import { PageHeader } from "@/components/layout/page-header";
import { BuyPanel } from "@/features/marketplace/buy-panel";
import { accentLabel, campaignName, licenseLabel } from "@/features/marketplace/labels";
import { PriceCurve } from "@/features/marketplace/price-curve";

export function DatasetDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data: c, error, isLoading, refetch } = useCampaign(id);
  const [showTerms, setShowTerms] = useState(false);
  const terms = useTerms(id, showTerms);

  if (isLoading) return <DetailSkeleton />;
  if (error || !c) return <div className="container-page py-16"><ErrorState description={error?.message} onRetry={() => refetch()} title="Không tìm thấy bộ dữ liệu" /></div>;

  const fullVnd = c.full_price.vnd;
  return (
    <div className="container-page pb-8">
      <PageHeader
        back={{ href: "/explore", label: "Tất cả bộ dữ liệu" }}
        eyebrow={<span className="flex flex-wrap gap-2"><Badge tone="cyan">{accentLabel(c.accent)}</Badge><CampaignStatusBadge status={c.status} />{!c.metadata_verified && <Badge tone="warning">Metadata chưa xác minh</Badge>}</span>}
        title={campaignName(c)}
        description={c.description}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="lg" className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
            <ProgressRing value={c.progress_bps / 10_000} size={140} label={`Tiến độ ${c.progress_bps / 100}%`}>
              <span className="text-2xl font-bold tabular">{(c.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</span>
              <span className="text-xs text-ink-muted">tiến độ</span>
            </ProgressRing>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Stat label="Giọng nói hợp lệ" value={formatDuration(c.total_sec)} sub={`mục tiêu ${formatDuration(c.target_sec)}`} />
              <Stat label="Người đóng góp" value={<AnimatedNumber value={c.contributors} format={(n) => Math.round(n).toString()} />} sub="đang còn hiệu lực" />
              <Stat label="Người mua" value={<AnimatedNumber value={c.buyers} format={(n) => Math.round(n).toString()} />} sub={`doanh thu ${c.revenue_total.display}`} />
              <Stat label="Hạn thu thập" value={formatDate(c.deadline)} sub={c.is_collecting ? "đang nhận bản ghi" : "vẫn mở bán"} />
            </dl>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <h2 className="text-h3">Giá theo tiến độ</h2>
              <div className="mt-4"><PriceCurve progressBps={c.progress_bps} fullVnd={fullVnd} /></div>
            </Card>
            <Card>
              <h2 className="text-h3">Chia doanh thu mỗi lần bán</h2>
              <SplitBar split={c.split} />
              <p className="mt-4 text-caption">Phần người đóng góp chia theo số giây còn hiệu lực tại thời điểm bán. Người đóng góp sau một lần bán không được chia lần đó.</p>
            </Card>
          </div>

          <Card>
            <h2 className="text-h3">Nghe thử</h2>
            {c.samples.length === 0 ? (
              <p className="mt-3 text-ink-muted">Chưa có bản ghi hợp lệ để nghe thử.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {c.samples.map((url, i) => <AudioPlayer key={url} src={url} label={`Mẫu ${i + 1}`} />)}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-h3">Thông tin license & dữ liệu</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Info label="Mục đích sử dụng" value={c.purpose ?? "—"} />
              <Info label="Loại license" value={licenseLabel(c.license)} />
              <Info label="Thời hạn license" value="Vĩnh viễn; bản ghi đã thu hồi không dùng cho lần huấn luyện mới" />
              <Info label="Số câu mẫu" value={`${c.prompt_count} câu`} />
              <Info label="Quỹ mồi còn lại" value={<MoneyText value={c.seed_balance} size="sm" />} />
              <Info label="Mã băm điều khoản" value={<span className="flex items-center gap-1 font-mono text-xs">{shortHex(c.terms_hash, 10, 8)}<CopyButton value={c.terms_hash} /></span>} />
            </dl>
            <button type="button" onClick={() => setShowTerms((v) => !v)} className="mt-5 text-sm font-semibold text-primary hover:underline" aria-expanded={showTerms}>
              {showTerms ? "Ẩn điều khoản đồng thuận" : "Xem điều khoản đồng thuận"}
            </button>
            {showTerms && (
              <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl bg-canvas p-4 text-sm leading-relaxed text-ink-soft">
                {terms.data ? <TermsText text={terms.data.terms_text} /> : terms.error ? terms.error.message : <Skeleton className="h-24" />}
              </div>
            )}
          </Card>

          <Card tone="soft">
            <h2 className="text-h3">Phiên bản dataset</h2>
            {c.latest_snapshot ? (
              <div className="mt-3 flex flex-col gap-2 text-sm">
                <p>
                  <b>v{c.latest_snapshot.version}</b> · {c.latest_snapshot.leaf_count} bản ghi · {formatDuration(c.latest_snapshot.total_sec)} ·{" "}
                  <Badge tone={c.latest_snapshot.status === "published" ? "success" : "warning"}>{c.latest_snapshot.status === "published" ? "đang phát hành" : c.latest_snapshot.status === "stale" ? "đã khóa, chờ chủ chiến dịch công bố lại" : c.latest_snapshot.status}</Badge>
                </p>
                <p className="flex items-center gap-1 font-mono text-xs text-ink-muted">Merkle root {shortHex(c.latest_snapshot.merkle_root, 12, 8)} <CopyButton value={c.latest_snapshot.merkle_root} /></p>
                <a className="w-fit font-semibold text-primary hover:underline" href={`${API_URL}/datasets/${c.id}/snapshots/${c.latest_snapshot.version}`} target="_blank" rel="noreferrer">Xem manifest công khai</a>
              </div>
            ) : (
              <p className="mt-3 text-ink-muted">Chủ chiến dịch chưa công bố phiên bản nào.</p>
            )}
            <p className="mt-3 text-caption">
              Chủ chiến dịch tự duyệt bản ghi máy chấm chưa chắc chắn: {c.review.approved} duyệt · {c.review.auto_approved} tự duyệt khi quá hạn ·{" "}
              {c.review.rejected} loại{c.review.pending ? ` · ${c.review.pending} đang chờ` : ""}.
            </p>
          </Card>
        </div>
        <aside id="buy" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start" aria-label="Mua bộ dữ liệu">
          <BuyPanel campaignId={id} />
        </aside>
      </div>
      {/* Di động: thanh hành động cố định để giá + nút mua luôn trong tầm tay */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.18)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <MoneyText value={c.price} size="md" />
          <a href="#buy" className={buttonClass("primary", "md")}>Mua license</a>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tracking-tight text-ink">{value}</dd>
      {sub && <dd className="text-xs text-ink-muted">{sub}</dd>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function SplitBar({ split }: { split: { contributor_bps: number; creator_bps: number; platform_bps: number } }) {
  const parts = [
    { label: "Người đóng góp", bps: split.contributor_bps, cls: "bg-gradient-to-r from-primary to-cyan" },
    { label: "Người tạo", bps: split.creator_bps, cls: "bg-peach" },
    { label: "Nền tảng", bps: split.platform_bps, cls: "bg-line-strong" },
  ];
  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p) => <span key={p.label} className={p.cls} style={{ width: `${p.bps / 100}%` }} />)}
      </div>
      <ul className="mt-4 grid gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between">
            <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${p.cls}`} aria-hidden />{p.label}</span>
            <b className="tabular">{p.bps / 100}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="container-page py-12">
      <LoadingBlock label="Đang tải bộ dữ liệu">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col gap-6"><SkeletonCard lines={4} /><SkeletonCard lines={3} /></div>
          <Skeleton className="h-72" />
        </div>
      </LoadingBlock>
    </div>
  );
}
