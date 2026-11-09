"use client";

// Chủ chiến dịch sở hữu dữ liệu của chiến dịch (implementation-plan §3 #28) — không có vai trò quản trị:
// - duyệt bản ghi vùng xám (QC chưa chắc chắn): nghe lại, Duyệt ⇒ ghi on-chain + trả tiền mồi, Loại ⇒ bắt buộc ghi lý do;
// - công bố phiên bản dataset: xem bản tóm tắt rồi KÝ PublishSnapshot bằng ví của mình; nền tảng gửi giao dịch, trả phí mạng.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { CampaignDetail, CampaignSummary, ReviewItem, SnapshotQuote } from "@/types/api";
import { formatDateTime, formatDuration, shortHex } from "@/lib/format";
import { describeChainError } from "@/lib/chainErrors";
import { qk } from "@/hooks/queries";
import { useWalletSession } from "@/hooks/useSessions";
import { useWalletTypedSigner } from "@/hooks/useSponsored";
import { useToast } from "@/providers/toast-provider";
import type { UserApi } from "@/services/api";
import { AudioPlayer } from "@/components/audio/audio-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { TxSteps, type StepPhase } from "@/components/tx/tx-steps";

const reviewKey = (id: number) => ["creator", "review", id] as const;

/** Khu vực dữ liệu của một chiến dịch trong "Chiến dịch của bạn": hàng chờ duyệt + phiên bản dataset. */
export function CampaignDataPanel({ c, detail }: { c: CampaignSummary; detail?: CampaignDetail }) {
  const w = useWalletSession();
  if (!w.api) return null;
  return (
    <div className="grid gap-5 border-t border-line pt-5 lg:col-span-3 lg:grid-cols-[1.4fr_1fr]">
      <ReviewQueue campaignId={c.id} api={w.api} />
      <SnapshotPublisher c={c} detail={detail} api={w.api} />
    </div>
  );
}

// ------------------------------------------------------------------ duyệt vùng xám

function ReviewQueue({ campaignId, api }: { campaignId: number; api: UserApi }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const [note, setNote] = useState("");
  const q = useQuery({ queryKey: reviewKey(campaignId), queryFn: () => api.reviewQueue(campaignId), refetchInterval: 15_000 });
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: number; decision: "approve" | "reject"; note?: string }) => api.decideReview(id, decision, note),
    onSuccess: (r) => {
      toast.success(r.status === "registered" ? "Đã duyệt — bản ghi được ghi nhận on-chain" : "Đã loại bản ghi", r.message);
      setRejecting(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: reviewKey(campaignId) });
      void qc.invalidateQueries({ queryKey: qk.campaign(campaignId) });
      void qc.invalidateQueries({ queryKey: qk.campaigns });
    },
    onError: (e) => toast.error("Chưa xử lý được", describeChainError(e)),
  });
  const items = q.data ?? [];

  return (
    <section aria-labelledby={`review-${campaignId}`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`review-${campaignId}`} className="font-semibold">Bản ghi chờ bạn duyệt</h3>
        {q.data && <Badge tone={items.length ? "warning" : "neutral"}>{items.length}</Badge>}
      </div>
      <p className="text-sm text-ink-muted">Nghe lại các bản ghi máy chấm chưa chắc chắn, rồi Duyệt hoặc Loại (kèm lý do).</p>
      {q.error && <ErrorState description={q.error.message} onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton className="h-24" />}
      {q.data && items.length === 0 && <p className="rounded-2xl bg-canvas p-4 text-sm text-ink-muted">Không có bản ghi nào chờ duyệt.</p>}
      {items.length > 0 && (
        <ul className="grid gap-3">
          {items.map((it) => (
            <ReviewCard
              key={it.id}
              it={it}
              api={api}
              busy={decide.isPending && decide.variables?.id === it.id}
              onApprove={() => decide.mutate({ id: it.id, decision: "approve" })}
              onReject={() => { setNote(""); setRejecting(it); }}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        dismissible={!decide.isPending}
        size="sm"
        title="Loại bản ghi"
        description={rejecting ? <>“{rejecting.prompt_text}” — audio sẽ bị xóa, người đóng góp thấy lý do bạn ghi.</> : null}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)} disabled={decide.isPending}>Hủy</Button>
            <Button
              variant="danger"
              disabled={!note.trim()}
              loading={decide.isPending}
              onClick={() => rejecting && decide.mutate({ id: rejecting.id, decision: "reject", note: note.trim() })}
            >
              Loại bản ghi
            </Button>
          </>
        }
      >
        <Field label="Lý do loại" hint="Bắt buộc. Ví dụ: đọc sai câu, nhiều tạp âm, không phải giọng thật.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} required />
        </Field>
      </Dialog>
    </section>
  );
}

function ReviewCard({ it, api, busy, onApprove, onReject }: { it: ReviewItem; api: UserApi; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const load = useCallback(() => api.reviewAudio(it.id), [api, it.id]);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="warning" dot>Vùng xám</Badge>
        <span className="text-caption">#{it.id} · ví {shortHex(it.address)} · {formatDateTime(it.created_at)}</span>
      </div>
      <p className="font-medium text-ink">“{it.prompt_text}”</p>
      <AudioPlayer load={load} label={`Bản ghi #${it.id}`} />
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-canvas p-2 text-center text-sm">
        <div><dt className="text-caption">Sai ký tự (CER)</dt><dd className="font-semibold tabular">{it.qc?.cer?.toFixed(2) ?? "—"}</dd></div>
        <div><dt className="text-caption">Khớp câu</dt><dd className="font-semibold tabular">{it.qc?.align_score?.toFixed(2) ?? "—"}</dd></div>
        <div><dt className="text-caption">Giây hợp lệ</dt><dd className="font-semibold tabular">{it.weight_sec}</dd></div>
      </dl>
      {it.qc?.hypothesis && <p className="text-sm text-ink-muted">Máy nghe được: <i>“{it.qc.hypothesis}”</i></p>}
      {it.qc?.reasons.length ? <p className="text-sm text-warning-ink">{it.qc.reasons.join("; ")}</p> : null}
      {it.auto_approve_at && <p className="text-caption">Tự duyệt lúc {formatDateTime(it.auto_approve_at)} nếu bạn chưa quyết định.</p>}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onApprove} loading={busy}>Duyệt</Button>
        <Button size="sm" variant="outline" className="flex-1 text-danger-ink" onClick={onReject} disabled={busy}>Loại…</Button>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ công bố phiên bản dataset

type PublishStep = "sign" | "relay";
const IDLE: Record<PublishStep, StepPhase> = { sign: "idle", relay: "idle" };

function SnapshotPublisher({ c, detail, api }: { c: CampaignSummary; detail?: CampaignDetail; api: UserApi }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sign = useWalletTypedSigner();
  const [quote, setQuote] = useState<SnapshotQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [phase, setPhase] = useState(IDLE);
  const [failed, setFailed] = useState<{ step: PublishStep; message: string } | null>(null);
  const [hash, setHash] = useState<string>();
  const running = phase.sign === "signing" || phase.relay === "pending";
  const snap = detail?.latest_snapshot ?? null;
  const pending = detail?.review.pending ?? 0;

  const open = async () => {
    setLoadingQuote(true);
    setPhase(IDLE);
    setFailed(null);
    setHash(undefined);
    try {
      setQuote(await api.snapshotQuote(c.id));
    } catch (e) {
      toast.error("Chưa lập được phiên bản", describeChainError(e));
    } finally {
      setLoadingQuote(false);
    }
  };

  const publish = async () => {
    if (!quote) return;
    let step: PublishStep = "sign";
    setFailed(null);
    try {
      setPhase({ sign: "signing", relay: "idle" });
      const signature = await sign(quote.sign.typed_data);
      step = "relay";
      setPhase({ sign: "success", relay: "pending" });
      const res = await api.publishSnapshot(c.id, quote.merkle_root, quote.sign.deadline, signature);
      setHash(res.tx_hash ?? undefined);
      setPhase({ sign: "success", relay: "success" });
      toast.success(`Đã công bố phiên bản v${res.version}`, `${res.leaf_count} bản ghi · người mua tải được ngay`);
      void qc.invalidateQueries({ queryKey: qk.campaign(c.id) });
      setQuote(null);
    } catch (e) {
      const message = describeChainError(e);
      setPhase((p) => ({ ...p, [step]: "error" }));
      setFailed({ step, message });
    }
  };

  const status = !snap
    ? { tone: "neutral" as const, text: "Chưa công bố phiên bản nào — người mua đã trả tiền chưa tải được dữ liệu." }
    : snap.status === "stale"
      ? { tone: "warning" as const, text: `Phiên bản v${snap.version} đã bị khóa vì có bản ghi bị thu hồi. Hãy công bố phiên bản mới để người mua tải tiếp.` }
      : snap.total_sec !== c.total_sec
        ? { tone: "primary" as const, text: `Đang phát hành v${snap.version} (${snap.leaf_count} bản ghi). Có dữ liệu mới chưa nằm trong phiên bản.` }
        : { tone: "success" as const, text: `Đang phát hành v${snap.version} · ${snap.leaf_count} bản ghi · ${formatDuration(snap.total_sec)}.` };

  return (
    <section aria-labelledby={`snap-${c.id}`} className="flex min-w-0 flex-col gap-3">
      <h3 id={`snap-${c.id}`} className="font-semibold">Phiên bản dataset</h3>
      <p className="text-sm text-ink-muted">Chỉ bạn quyết định khi nào công bố phiên bản cho người mua tải.</p>
      <p className={status.tone === "warning" ? "rounded-2xl bg-warning-soft p-3 text-sm text-warning-ink" : "rounded-2xl bg-canvas p-3 text-sm"}>
        {status.text}
      </p>
      {detail && (
        <p className="text-caption">
          Duyệt vùng xám: {detail.review.approved} duyệt · {detail.review.auto_approved} tự duyệt khi quá hạn · {detail.review.rejected} loại
          {pending ? ` · ${pending} đang chờ` : ""}
        </p>
      )}
      <Button size="sm" variant={snap?.status === "stale" || !snap ? "primary" : "secondary"} className="w-fit" onClick={open} loading={loadingQuote} disabled={c.total_sec === 0}>
        Công bố phiên bản mới
      </Button>

      <Dialog
        open={quote !== null}
        onClose={() => setQuote(null)}
        dismissible={!running}
        title={quote ? `Công bố phiên bản v${quote.version}` : "Công bố phiên bản"}
        description="Kiểm tra bản tóm tắt rồi ký bằng ví của bạn. Người đã mua license sẽ tải đúng phiên bản này."
        footer={
          <>
            <Button variant="ghost" onClick={() => setQuote(null)} disabled={running}>Đóng</Button>
            <Button onClick={publish} loading={running} disabled={!quote?.changed}>Ký & công bố</Button>
          </>
        }
      >
        {quote && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-sm">
              <div><dt className="text-caption">Số bản ghi</dt><dd className="font-semibold tabular">{quote.leaf_count}</dd></div>
              <div><dt className="text-caption">Tổng thời lượng</dt><dd className="font-semibold">{formatDuration(quote.total_sec)}</dd></div>
              <div className="col-span-2"><dt className="text-caption">Mã Merkle (dấu vân tay của phiên bản, lưu on-chain)</dt><dd className="font-mono text-xs">{shortHex(quote.merkle_root, 14, 10)}</dd></div>
            </dl>
            {!quote.changed && <p className="text-sm text-ink-muted">Không có thay đổi so với phiên bản v{quote.latest_version} đang phát hành.</p>}
            {pending > 0 && <p className="text-sm text-warning-ink">Còn {pending} bản ghi chờ duyệt chưa nằm trong phiên bản này.</p>}
            {(phase.sign !== "idle" || failed) && (
              <TxSteps
                steps={[
                  { label: "Ký công bố (miễn phí)", phase: phase.sign, error: failed?.step === "sign" ? failed.message : undefined },
                  { label: "Gửi giao dịch", phase: phase.relay, hash, error: failed?.step === "relay" ? failed.message : undefined },
                ]}
              />
            )}
          </div>
        )}
      </Dialog>
    </section>
  );
}
