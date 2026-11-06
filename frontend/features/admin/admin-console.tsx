"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ReviewItem } from "@/types/api";
import { API_URL } from "@/lib/config";
import { formatDateTime, formatDuration, shortHex } from "@/lib/format";
import { useCampaigns } from "@/hooks/queries";
import { ApiError, createAdminApi, type AdminApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { AudioPlayer } from "@/components/audio/audio-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { TxHash } from "@/components/tx/tx-steps";
import { campaignName } from "@/features/marketplace/labels";

const KEY = "giongque.adminKey";
type Tab = "review" | "snapshots" | "relayer";

/** Bảng điều khiển QC — chỉ các chức năng backend cho phép (header X-Admin-Key). Khóa chỉ giữ trong sessionStorage. */
export function AdminConsole() {
  const [key, setKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKey(sessionStorage.getItem(KEY)), []);
  const api = useMemo(() => (key ? createAdminApi(key) : null), [key]);
  const check = useQuery({ queryKey: ["admin", "relayer", key], queryFn: () => api!.relayer(), enabled: Boolean(api), retry: false });

  if (!api || (check.error instanceof ApiError && check.error.status === 403)) {
    return <AdminLogin error={check.error ? "Sai admin key" : null} onSubmit={(k) => { sessionStorage.setItem(KEY, k); setKey(k); }} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs label="Khu vực quản trị" value={tab} onChange={setTab} items={[{ value: "review", label: "Hàng chờ duyệt" }, { value: "snapshots", label: "Phiên bản dataset" }, { value: "relayer", label: "Relayer & giao dịch" }]} />
        <Button variant="ghost" size="sm" onClick={() => { sessionStorage.removeItem(KEY); setKey(null); }}>Đăng xuất quản trị</Button>
      </div>
      {tab === "review" && <ReviewQueue api={api} />}
      {tab === "snapshots" && <Snapshots api={api} />}
      {tab === "relayer" && <Relayer api={api} />}
    </div>
  );
}

function AdminLogin({ onSubmit, error }: { onSubmit: (k: string) => void; error: string | null }) {
  const [k, setK] = useState("");
  return (
    <Card padding="lg" className="mx-auto max-w-md">
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(k); }} className="flex flex-col gap-4">
        <h2 className="text-h3">Đăng nhập quản trị</h2>
        <p className="text-sm text-ink-muted">Nhập ADMIN_API_KEY của máy chủ. Khóa chỉ lưu trong phiên trình duyệt này.</p>
        <Field label="Admin key" error={error}><PasswordInput value={k} onChange={(e) => setK(e.target.value)} autoComplete="off" required /></Field>
        <Button type="submit" disabled={!k}>Vào bảng điều khiển</Button>
      </form>
    </Card>
  );
}

function ReviewQueue({ api }: { api: AdminApi }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin", "review"], queryFn: api.review, refetchInterval: 10_000 });
  const decide = useMutation({
    mutationFn: ({ id, d }: { id: number; d: "approve" | "reject" }) => api.decide(id, d),
    onSuccess: (r) => {
      toast.success(r.status === "registered" ? "Đã duyệt và ghi lên chain" : "Đã loại bản ghi", r.message);
      void qc.invalidateQueries({ queryKey: ["admin", "review"] });
    },
    onError: (e) => toast.error("Không xử lý được", e.message),
  });
  if (q.error) return <ErrorState description={q.error.message} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-48" />;
  if (!q.data?.length) return <EmptyState title="Không có bản ghi chờ duyệt" description="Bản ghi vùng xám (QC chưa chắc chắn) và bản ghi đạt nhưng chưa ghi được lên chain sẽ xuất hiện ở đây." />;
  return (
    <ul className="grid gap-4">
      {q.data.map((it) => <ReviewCard key={it.id} it={it} api={api} busy={decide.isPending && decide.variables?.id === it.id} onDecide={(d) => decide.mutate({ id: it.id, d })} />)}
    </ul>
  );
}

function ReviewCard({ it, api, busy, onDecide }: { it: ReviewItem; api: AdminApi; busy: boolean; onDecide: (d: "approve" | "reject") => void }) {
  const load = useCallback(() => api.reviewAudio(it.id), [api, it.id]);
  return (
    <li>
      <Card className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" dot>{it.status === "gray" ? "Vùng xám" : "Chờ ghi lên chain"}</Badge>
            <span className="text-caption">#{it.id} · chiến dịch {it.campaign_id} · {formatDateTime(it.created_at)} · ví {shortHex(it.address)}</span>
          </div>
          <p className="text-lg font-medium text-ink">“{it.prompt_text}”</p>
          <AudioPlayer load={load} label={`Bản ghi #${it.id}`} />
          {it.error && <p className="text-sm text-danger-ink">{it.error}</p>}
        </div>
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-canvas p-3 text-center text-sm">
            <div><dt className="text-caption">CER</dt><dd className="font-semibold tabular">{it.qc?.cer?.toFixed(2) ?? "—"}</dd></div>
            <div><dt className="text-caption">Align</dt><dd className="font-semibold tabular">{it.qc?.align_score?.toFixed(2) ?? "—"}</dd></div>
            <div><dt className="text-caption">Giây</dt><dd className="font-semibold tabular">{it.weight_sec}</dd></div>
          </dl>
          {it.qc?.hypothesis && <p className="text-sm text-ink-muted">Máy nghe: <i>“{it.qc.hypothesis}”</i></p>}
          {it.qc?.reasons.length ? <p className="text-sm text-warning-ink">{it.qc.reasons.join("; ")}</p> : null}
          <div className="mt-auto flex gap-2">
            <Button className="flex-1" onClick={() => onDecide("approve")} loading={busy}>Duyệt & ghi on-chain</Button>
            <Button variant="outline" className="flex-1 text-danger-ink" onClick={() => onDecide("reject")} disabled={busy}>Loại</Button>
          </div>
        </div>
      </Card>
    </li>
  );
}

function Snapshots({ api }: { api: AdminApi }) {
  const campaigns = useCampaigns();
  const qc = useQueryClient();
  const toast = useToast();
  const publish = useMutation({
    mutationFn: (id: number) => api.snapshot(id),
    onSuccess: (s) => {
      toast.success(`Đã công bố phiên bản v${s.version}`, `${s.leaf_count} bản ghi · Merkle root ${shortHex(s.merkle_root, 10, 6)}`);
      void qc.invalidateQueries({ queryKey: ["campaign", s.campaign_id] });
    },
    onError: (e) => toast.error("Chưa công bố được", e.message),
  });
  if (campaigns.isLoading) return <Skeleton className="h-48" />;
  return (
    <ul className="grid gap-3">
      {(campaigns.data ?? []).map((c) => (
        <li key={c.id}>
          <Card padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">#{c.id} · {campaignName(c)}</p>
              <p className="text-caption">{formatDuration(c.total_sec)} hợp lệ · {(c.progress_bps / 100).toLocaleString("vi-VN")}% tiến độ</p>
            </div>
            <div className="flex items-center gap-2">
              <a className="text-sm font-semibold text-primary hover:underline" href={`${API_URL}/campaigns/${c.id}`} target="_blank" rel="noreferrer">API</a>
              <Button size="sm" onClick={() => publish.mutate(c.id)} loading={publish.isPending && publish.variables === c.id} disabled={c.total_sec === 0}>Công bố phiên bản mới</Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Relayer({ api }: { api: AdminApi }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin", "relayer-status"], queryFn: api.relayer, refetchInterval: 10_000 });
  const sync = useMutation({ mutationFn: api.sync, onSuccess: (r) => toast.success("Đã đồng bộ sự kiện", `${r.processed_events} sự kiện mới · block ${r.last_block}`), onError: (e) => toast.error("Lỗi đồng bộ", e.message) });
  if (q.error) return <ErrorState description={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-48" />;
  const r = q.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Card padding="sm"><p className="text-caption">Relayer</p><p className="font-mono text-sm">{shortHex(r.relayer_address)}</p><p className="mt-1 font-semibold">{r.relayer_balance_avax.toFixed(4)} AVAX</p></Card>
        <Card padding="sm"><p className="text-caption">QC oracle</p><p className="font-mono text-sm">{shortHex(r.qc_oracle_address)}</p><Badge tone={r.qc_oracle_matches ? "success" : "danger"}>{r.qc_oracle_matches ? "Khớp qcOracle on-chain" : "KHÔNG khớp on-chain"}</Badge></Card>
        <Card padding="sm" tone={r.low_balance ? "peach" : "default"}><p className="text-caption">Phí rút hộ / ví nhận phí chưa rút</p><p className="font-semibold">{r.claim_fee.display}</p><p className="text-sm text-ink-muted">{r.fee_collector_withdrawable.display}</p>{r.low_balance && <p className="mt-1 text-sm text-peach-ink">Số dư AVAX thấp — hãy nạp thêm.</p>}</Card>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-h3">Giao dịch gần đây</h3>
        <Button size="sm" variant="outline" onClick={() => sync.mutate()} loading={sync.isPending}>Đồng bộ sự kiện</Button>
      </div>
      <ul className="surface-card divide-y divide-line">
        {r.recent.map((t) => (
          <li key={t.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{t.kind} <span className="text-caption">· {formatDateTime(t.created_at)}</span></p>
              {t.tx_hash && <TxHash hash={t.tx_hash} />}
              {t.error && <p className="text-sm text-danger-ink">{t.error}</p>}
            </div>
            <Badge tone={t.status === "confirmed" ? "success" : t.status === "sent" ? "primary" : "danger"} dot>{t.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
