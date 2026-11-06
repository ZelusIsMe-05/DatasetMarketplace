"use client";

import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useAccount } from "wagmi";
import { network } from "@/lib/config";
import { formatDuration } from "@/lib/format";
import { qk, useCampaigns } from "@/hooks/queries";
import { publicApi } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { ConnectWallet } from "@/components/wallet/connect-wallet";
import { VoiceSignature } from "@/features/marketplace/dataset-card";
import { DownloadPanel } from "@/features/marketplace/download-panel";
import { accentLabel, campaignName } from "@/features/marketplace/labels";

/** Bộ dữ liệu ví đang kết nối đã mua (đọc license on-chain qua backend cho từng chiến dịch). */
export function Library() {
  const { address, chainId } = useAccount();
  const campaigns = useCampaigns();
  const licenses = useQueries({
    queries: (campaigns.data ?? []).map((c) => ({
      queryKey: qk.license(c.id, address),
      queryFn: () => publicApi.license(c.id, address!),
      enabled: Boolean(address),
    })),
  });

  if (!address || chainId !== network.chain.id) {
    return (
      <div className="container-page">
        <EmptyState title="Kết nối ví để xem bộ dữ liệu đã mua" description="License được ghi trên Avalanche theo địa chỉ ví người mua." action={<ConnectWallet />} />
      </div>
    );
  }
  if (campaigns.error) return <div className="container-page"><ErrorState description={campaigns.error.message} onRetry={() => campaigns.refetch()} /></div>;
  const loading = campaigns.isLoading || licenses.some((l) => l.isLoading);
  const owned = (campaigns.data ?? []).flatMap((c, i) => (licenses[i]?.data?.licensed ? [{ c, lic: licenses[i].data! }] : []));

  return (
    <div className="container-page">
      {loading && <div className="grid gap-5 md:grid-cols-2">{[0, 1].map((i) => <SkeletonCard key={i} lines={5} />)}</div>}
      {!loading && owned.length === 0 && (
        <EmptyState title="Bạn chưa mua bộ dữ liệu nào" description="Mua sớm khi chiến dịch đang thu thập để có giá thấp hơn — bạn vẫn nhận mọi bản cập nhật." action={<ButtonLink href="/explore">Khám phá bộ dữ liệu</ButtonLink>} />
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {owned.map(({ c, lic }) => (
          <Card key={c.id} padding="lg" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="cyan">{accentLabel(c.accent)}</Badge>
              <Badge tone={c.is_collecting ? "success" : "neutral"} dot>{c.is_collecting ? "Còn đang cập nhật" : "Đã chốt dữ liệu"}</Badge>
            </div>
            <Link href={`/datasets/${c.id}`} className="text-h3 hover:text-primary-active">{campaignName(c)}</Link>
            <VoiceSignature seed={c.id} className="h-10" />
            <p className="text-sm text-ink-muted">Hiện có {formatDuration(c.total_sec)} giọng nói hợp lệ ({(c.progress_bps / 100).toLocaleString("vi-VN")}% mục tiêu).</p>
            <DownloadPanel campaignId={c.id} license={lic} compact />
          </Card>
        ))}
      </div>
    </div>
  );
}
