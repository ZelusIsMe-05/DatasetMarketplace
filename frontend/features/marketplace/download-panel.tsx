"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import type { DownloadResponse, LicenseInfo } from "@/types/api";
import { describeChainError } from "@/lib/chainErrors";
import { formatDate, formatDuration, shortHex } from "@/lib/format";
import { useCampaign } from "@/hooks/queries";
import { useAccountWallet } from "@/hooks/useSessions";
import { ApiError, publicApi } from "@/services/api";
import { useToast } from "@/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/misc";

/**
 * Tải dataset theo license (§6.6): ví ký thông điệp (có nonce) → backend kiểm license on-chain → link có hạn.
 * Bản tải luôn là phiên bản mới nhất còn hiệu lực (đã loại bản ghi bị thu hồi).
 */
export function DownloadPanel({ campaignId, license, compact }: { campaignId: number; license: LicenseInfo; compact?: boolean }) {
  const aw = useAccountWallet();
  const address = aw.metamask === "ready" ? aw.address : null; // ví đã gắn với Gmail đang đăng nhập
  const { signMessageAsync } = useSignMessage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<DownloadResponse | null>(null);
  const detail = useCampaign(campaignId);
  const snap = detail.data?.latest_snapshot;
  const available = snap?.status === "published";

  const download = async () => {
    if (!address) return;
    setBusy(true);
    try {
      const msg = await publicApi.downloadMessage(campaignId, address);
      const signature = await signMessageAsync({ message: msg.message });
      const res = await publicApi.requestDownload(campaignId, address, msg.issued_at, msg.nonce, signature);
      setLast(res);
      window.location.assign(res.download_url); // file zip (audio + manifest + proof Merkle)
      toast.success(`Đang tải phiên bản v${res.snapshot.version}`, `${res.snapshot.leaf_count} bản ghi · link hết hạn sau 10 phút`);
    } catch (e) {
      const m = e instanceof ApiError && e.code === "no_snapshot" ? "Chủ chiến dịch chưa công bố phiên bản dữ liệu hợp lệ (hoặc đang cập nhật sau khi có bản ghi bị thu hồi). Hãy quay lại sau." : describeChainError(e);
      toast.error("Chưa tải được dữ liệu", m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!compact && (
        <div className="flex items-center gap-2">
          <Badge tone="success" dot>Bạn đã có license</Badge>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-success-soft/60 p-4 text-sm">
        <dt className="text-ink-muted">Ngày mua</dt>
        <dd className="text-right font-semibold">{formatDate(license.purchased_at)}</dd>
        <dt className="text-ink-muted">Tiến độ lúc mua</dt>
        <dd className="text-right font-semibold tabular">{(license.progress_bps_at_purchase / 100).toLocaleString("vi-VN")}%</dd>
        <dt className="text-ink-muted">Đã trả</dt>
        <dd className="text-right font-semibold tabular">{license.price_paid.display}</dd>
      </dl>
      <p className="text-sm text-ink-muted" aria-live="polite">
        {detail.isLoading ? "Đang kiểm tra phiên bản…" : available ? `Phiên bản v${snap!.version}: ${snap!.leaf_count} bản ghi · ${formatDuration(snap!.total_sec)}` : "Chủ chiến dịch chưa công bố phiên bản dữ liệu hợp lệ — hãy quay lại sau."}
      </p>
      <Button onClick={download} loading={busy} disabled={!available} icon={<DownloadIcon />}>
        Tải phiên bản mới nhất
      </Button>
      {last && (
        <div className="rounded-2xl border border-line p-3 text-xs text-ink-muted">
          <p className="font-semibold text-ink">Phiên bản v{last.snapshot.version} · {last.snapshot.leaf_count} bản ghi</p>
          <p className="mt-1 flex items-center gap-1 font-mono">
            Merkle root {shortHex(last.snapshot.merkle_root, 10, 8)} <CopyButton value={last.snapshot.merkle_root} label="Sao chép Merkle root" />
          </p>
          <p>Đối chiếu root này với sự kiện SnapshotPublished trên chain.</p>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
