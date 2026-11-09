"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@/hooks/queries";
import { useContributor } from "@/hooks/useSessions";

/** Bản ghi + tiền chưa rút của người đóng góp (GET /me/contributions, tiền đọc on-chain). */
export function useMyContributions() {
  const c = useContributor();
  return useQuery({
    queryKey: qk.mine(c.address ?? undefined),
    queryFn: () => c.api!.myContributions(),
    enabled: Boolean(c.api),
    refetchInterval: 15_000,
  });
}

export function useConsentStatus(campaignId: number) {
  const c = useContributor();
  return useQuery({
    queryKey: qk.consent(campaignId, c.address ?? undefined),
    queryFn: () => c.api!.consentStatus(campaignId),
    enabled: Boolean(c.api),
  });
}

/** Thông điệp QC thân thiện cho người phổ thông (không thuật ngữ kỹ thuật). */
export function friendlyQcReason(reasons: string[]): string {
  const r = reasons.join(" | ");
  // Chủ chiến dịch loại sau khi nghe lại (implementation-plan §3 #28): hiện đúng lý do họ ghi.
  const byCreator = reasons.find((x) => x.startsWith("Chủ chiến dịch loại:"));
  if (byCreator) return byCreator;
  if (r.includes("độ dài")) return "Bản ghi quá ngắn hoặc quá dài. Hãy đọc trọn câu, khoảng 2–15 giây.";
  if (r.includes("quá ít giọng nói")) return "Mình chưa nghe rõ giọng bạn. Thử nói to hơn hoặc ở nơi yên tĩnh hơn.";
  if (r.includes("tốc độ đọc")) return "Bạn đọc hơi nhanh hoặc hơi chậm. Hãy đọc với nhịp nói chuyện tự nhiên.";
  if (r.includes("không khớp") || r.includes("quá ngắn so với câu mẫu")) return "Bản ghi chưa khớp câu mẫu. Hãy đọc đúng và đủ từng chữ.";
  if (r.includes("dưới 1 giây")) return "Phần giọng nói quá ngắn để ghi nhận.";
  if (r.includes("từ đáng ngờ")) return "Có vài từ nghe chưa rõ, chủ chiến dịch sẽ nghe lại bản ghi.";
  return reasons[0] ?? "Bản ghi chưa đạt yêu cầu.";
}
