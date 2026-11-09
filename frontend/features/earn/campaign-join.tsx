"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { whenVisible } from "@/lib/visibility";
import { describeChainError } from "@/lib/chainErrors";
import { formatDate, formatDuration, shortHex } from "@/lib/format";
import { qk, useCampaign, useTerms } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { TermsText } from "@/components/terms-text";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { PageHeader } from "@/components/layout/page-header";
import { TxSteps, type TxStepView } from "@/components/tx/tx-steps";
import { accentLabel, campaignName } from "@/features/marketplace/labels";
import { useConsentStatus } from "@/features/earn/use-earn";

export function CampaignJoin({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const { data: c, error, refetch } = useCampaign(id);
  const consent = useConsentStatus(id);
  const [open, setOpen] = useState(false);

  if (error) return <ErrorState className="mt-8" description={error.message} onRetry={() => refetch()} />;
  if (!c) return <Skeleton className="mt-8 h-96" />;
  const consented = consent.data?.consented;

  return (
    <div className="pb-8">
      <PageHeader
        back={{ href: "/earn/campaigns", label: "Các chiến dịch" }}
        eyebrow={<Badge tone="cyan">{accentLabel(c.accent)}</Badge>}
        title={campaignName(c)}
        description={c.description}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="text-h3">Bạn sẽ làm gì?</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                ["Ký đồng thuận", "Đọc điều khoản và ký một lần cho chiến dịch. Miễn phí."],
                ["Đọc câu mẫu", "Bấm ghi âm, câu hiện ra, bạn đọc tự nhiên bằng giọng của mình."],
                ["Nhận tiền", "Bản ghi đạt được ghi lên chain; mỗi lần bán bạn được chia."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl bg-canvas p-4">
                  <span className="text-sm font-bold text-primary">Bước {i + 1}</span>
                  <p className="mt-1 font-semibold text-ink">{t}</p>
                  <p className="mt-1 text-sm text-ink-muted">{d}</p>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <h2 className="text-h3">Mục đích sử dụng dữ liệu</h2>
            <p className="mt-2 text-ink-soft">{c.purpose ?? "—"}</p>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-caption">Số câu mẫu</dt><dd className="font-semibold">{c.prompt_count} câu</dd></div>
              <div><dt className="text-caption">Hạn thu thập</dt><dd className="font-semibold">{formatDate(c.deadline)}</dd></div>
              <div><dt className="text-caption">Phần người đóng góp</dt><dd className="font-semibold">{c.split.contributor_bps / 100}% mỗi lần bán</dd></div>
            </dl>
          </Card>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <p className="text-caption">Tiến độ chiến dịch</p>
            <p className="mt-1 text-2xl font-bold">{(c.progress_bps / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</p>
            <Progress value={c.progress_bps / 10_000} label="Tiến độ" className="mt-3" />
            <p className="mt-2 text-caption">{formatDuration(c.total_sec)} / {formatDuration(c.target_sec)} · {c.contributors} người đóng góp</p>
            {c.seed_rate_per_sec.units > 0 && c.seed_balance.units > 0 && (
              <p className="mt-4 rounded-xl bg-peach-soft p-3 text-sm text-peach-ink">Có quỹ mồi: nhận tiền ngay cho mỗi giây hợp lệ (còn {c.seed_balance.display}).</p>
            )}
            <div className="mt-5">
              {!c.is_collecting ? (
                <p className="rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">Chiến dịch đã ngừng nhận bản ghi.</p>
              ) : consent.isLoading ? (
                <Skeleton className="h-11" />
              ) : consented ? (
                <div className="flex flex-col gap-3">
                  <Badge tone="success" dot>Đã đồng thuận {consent.data && formatDate(consent.data.consented_at)}</Badge>
                  <ButtonLink href={`/earn/campaigns/${id}/record`} size="lg" transitionTypes={["nav-forward"]}>Bắt đầu ghi âm</ButtonLink>
                </div>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setOpen(true)}>Đọc & ký đồng thuận</Button>
              )}
            </div>
          </Card>
        </aside>
      </div>
      <ConsentDialog campaignId={id} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ConsentDialog({ campaignId, open, onClose }: { campaignId: number; open: boolean; onClose: () => void }) {
  const c = useContributor();
  const terms = useTerms(campaignId, open);
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [steps, setSteps] = useState<TxStepView[] | null>(null);
  const busy = steps?.some((s) => ["signing", "pending"].includes(s.phase)) ?? false;

  const sign = async () => {
    if (!c.api || !c.signer) return;
    const set = (a: TxStepView["phase"], b: TxStepView["phase"], extra: Partial<TxStepView> = {}) =>
      setSteps([
        { label: c.kind === "metamask" ? "Ký đồng thuận trong MetaMask" : "Ký đồng thuận", phase: a },
        { label: "Ghi nhận đồng thuận", phase: b, ...extra },
      ]);
    try {
      set("signing", "waiting");
      const td = await c.api.consentTypedData(campaignId);
      const sig = await c.signer.signTypedData(td);
      set("success", "pending");
      const res = await c.api.consent(campaignId, td.deadline, sig);
      set("success", "success", { hash: res.tx_hash ?? undefined });
      await qc.invalidateQueries({ queryKey: qk.consent(campaignId, c.address ?? undefined) });
      toast.success("Đã ký đồng thuận", "Bạn có thể bắt đầu ghi âm.");
      window.setTimeout(async () => {
        await whenVisible(); // vừa ký trong cửa sổ ví: chuyển trang khi tab hiện lại (tránh InvalidStateError của View Transitions)
        onClose();
        router.push(`/earn/campaigns/${campaignId}/record`);
      }, 700);
    } catch (e) {
      const msg = describeChainError(e);
      setSteps((s) => s?.map((x) => (x.phase === "signing" || x.phase === "pending" ? { ...x, phase: "error", error: msg } : x)) ?? null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Điều khoản đồng thuận"
      description="Đọc kỹ trước khi ký. Bạn có thể thu hồi bất cứ lúc nào và vẫn giữ tiền đã kiếm."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Để sau</Button>
          <Button onClick={sign} loading={busy} disabled={!agreed || !terms.data?.matches || steps?.at(-1)?.phase === "success"}>
            Ký đồng thuận (miễn phí)
          </Button>
        </>
      }
    >
      {terms.isLoading && <Skeleton className="h-64" />}
      {terms.error && <ErrorState description={terms.error.message} />}
      {terms.data && (
        <div className="flex flex-col gap-4">
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${terms.data.matches ? "bg-success-soft text-success-ink" : "bg-danger-soft text-danger-ink"}`}>
            <span aria-hidden>{terms.data.matches ? "✓" : "!"}</span>
            <span>
              {terms.data.matches ? "Văn bản này khớp đúng mã băm đã ghi trên hợp đồng" : "Văn bản KHÔNG khớp mã băm trên hợp đồng — không thể ký"} (
              <span className="font-mono">{shortHex(terms.data.onchain_terms_hash, 8, 6)}</span>).
            </span>
          </div>
          <div tabIndex={0} aria-label="Nội dung điều khoản" className="max-h-[40vh] overflow-y-auto rounded-2xl border border-line bg-canvas p-4 text-sm leading-relaxed text-ink-soft">
            <TermsText text={terms.data.terms_text} />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1 text-sm text-ink">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#2563eb]" />
            Tôi đã đọc, hiểu và đồng ý cho chiến dịch này sử dụng giọng nói của tôi theo các điều khoản trên.
          </label>
          {steps && <TxSteps steps={steps} />}
        </div>
      )}
    </Dialog>
  );
}
