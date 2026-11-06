"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MyContributions, RevokeResponse } from "@/types/api";
import { signTyped } from "@/lib/browserWallet";
import { formatDateTime } from "@/lib/format";
import { qk } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";
import { useToast } from "@/providers/toast-provider";
import { ContributionStatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { TxHash, TxSteps, type TxStepView } from "@/components/tx/tx-steps";
import { friendlyQcReason, useMyContributions } from "@/features/earn/use-earn";

type Filter = "all" | "registered" | "pending" | "rejected" | "revoked";
type Item = MyContributions["contributions"][number];

const match = (f: Filter, s: string) =>
  f === "all" || (f === "registered" && s === "registered") || (f === "pending" && (s === "gray" || s === "pending_chain")) || (f === "rejected" && (s === "rejected" || s === "failed")) || (f === "revoked" && s === "revoked");

export function History() {
  const mine = useMyContributions();
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<Item | null>(null);
  if (mine.error) return <ErrorState className="mt-8" description={mine.error.message} onRetry={() => mine.refetch()} />;
  const items = [...(mine.data?.contributions ?? [])].reverse();
  const count = (f: Filter) => items.filter((x) => match(f, x.status)).length;
  const shown = items.filter((x) => match(filter, x.status));

  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2">Bản ghi của tôi</h1>
        <p className="mt-2 text-ink-muted">Bạn có thể thu hồi đồng thuận cho từng bản ghi hợp lệ bất cứ lúc nào. Tiền đã kiếm vẫn là của bạn.</p>
      </div>
      <Tabs label="Lọc bản ghi" value={filter} onChange={setFilter} items={[
        { value: "all", label: "Tất cả", count: count("all") },
        { value: "registered", label: "Hợp lệ", count: count("registered") },
        { value: "pending", label: "Chờ duyệt", count: count("pending") },
        { value: "rejected", label: "Chưa đạt", count: count("rejected") },
        { value: "revoked", label: "Đã thu hồi", count: count("revoked") },
      ]} />
      {mine.isLoading && <Skeleton className="h-64" />}
      {mine.data && shown.length === 0 && <EmptyState title="Không có bản ghi nào ở mục này" action={filter === "all" ? <ButtonLink href="/earn/campaigns">Bắt đầu ghi âm</ButtonLink> : undefined} />}
      {shown.length > 0 && (
        <ul className="surface-card divide-y divide-line">
          {shown.map((x) => (
            <li key={x.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="font-medium text-ink">“{x.prompt_text}”</p>
                <p className="mt-1 text-caption">
                  Chiến dịch #{x.campaign_id} · {formatDateTime(x.created_at)}
                  {x.weight_sec > 0 && ` · ${x.weight_sec} giây hợp lệ`}
                  {x.onchain_id !== null && ` · bản ghi on-chain #${x.onchain_id}`}
                </p>
                {(x.status === "rejected" || x.status === "failed") && x.reasons.length > 0 && <p className="mt-1 text-sm text-danger-ink">{friendlyQcReason(x.reasons)}</p>}
                {x.tx_hash && <TxHash hash={x.tx_hash} />}
                {x.revoke_tx_hash && <p className="mt-1 text-xs text-ink-muted">Thu hồi: <span className="font-mono">{x.revoke_tx_hash.slice(0, 14)}…</span> · audio và salt đã xóa</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ContributionStatusBadge status={x.status} />
                {x.status === "registered" && x.onchain_id !== null && (
                  <Button size="sm" variant="ghost" className="text-danger-ink hover:!bg-danger-soft" onClick={() => setTarget(x)}>Thu hồi</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RevokeDialog item={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function RevokeDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const c = useContributor();
  const qc = useQueryClient();
  const toast = useToast();
  const [steps, setSteps] = useState<TxStepView[] | null>(null);
  const [done, setDone] = useState<RevokeResponse | null>(null);
  const busy = steps?.some((s) => s.phase === "signing" || s.phase === "pending") ?? false;
  const close = () => {
    if (busy) return;
    setSteps(null);
    setDone(null);
    onClose();
  };

  const revoke = async () => {
    if (!item || item.onchain_id === null || !c.api || !c.account) return;
    const set = (a: TxStepView["phase"], b: TxStepView["phase"], extra: Partial<TxStepView> = {}) =>
      setSteps([{ label: "Ký yêu cầu thu hồi", phase: a }, { label: "Ghi thu hồi lên Avalanche, xóa audio", phase: b, note: "Không tốn AVAX", ...extra }]);
    try {
      set("signing", "waiting");
      const td = await c.api.revokeTypedData(item.onchain_id);
      const sig = await signTyped(c.account, td);
      set("success", "pending");
      const res = await c.api.revoke(item.onchain_id, td.deadline, sig);
      set("success", "success", { hash: res.tx_hash });
      setDone(res);
      await qc.invalidateQueries({ queryKey: qk.mine(c.address ?? undefined) });
      toast.success("Đã thu hồi đồng thuận", res.audio_deleted ? "Audio và salt đã bị xóa khỏi máy chủ." : undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Lỗi";
      setSteps((s) => s?.map((x) => (x.phase === "signing" || x.phase === "pending" ? { ...x, phase: "error", error: msg } : x)) ?? null);
    }
  };

  return (
    <ConfirmDialog
      open={item !== null}
      onClose={close}
      onConfirm={done ? close : revoke}
      loading={busy}
      tone={done ? "primary" : "danger"}
      confirmLabel={done ? "Xong" : "Thu hồi bản ghi này"}
      title="Thu hồi đồng thuận?"
      description={item ? `“${item.prompt_text}”` : undefined}
    >
      <ul className="flex flex-col gap-2 text-sm text-ink-soft">
        <li>✓ Bạn <b>giữ nguyên</b> mọi khoản tiền đã kiếm từ bản ghi này.</li>
        <li>✕ Bạn <b>không được chia</b> các lần bán sau từ bản ghi này.</li>
        <li>✕ Audio và salt bị <b>xóa</b>; phiên bản dataset phát hành sau không còn bản ghi.</li>
        <li>• Không thể hoàn tác. Lịch sử đồng ý/thu hồi vẫn nằm trên chain làm bằng chứng.</li>
      </ul>
      {steps && <TxSteps steps={steps} className="mt-4" />}
      {done && <p className="mt-3 text-sm text-ink-muted">Tiến độ chiến dịch còn {(done.new_progress_bps / 100).toLocaleString("vi-VN")}%, giá mới {done.new_price.display}.</p>}
    </ConfirmDialog>
  );
}
