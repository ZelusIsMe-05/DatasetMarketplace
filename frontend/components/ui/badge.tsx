import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "primary" | "cyan" | "success" | "warning" | "danger" | "peach";

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "bg-surface-muted text-ink-soft border-line", dot: "bg-ink-muted" },
  primary: { box: "bg-primary-soft text-primary-active border-primary-line", dot: "bg-primary" },
  cyan: { box: "bg-cyan-soft text-cyan-ink border-[#a5f3fc]", dot: "bg-cyan" },
  success: { box: "bg-success-soft text-success-ink border-[#a7f3d0]", dot: "bg-success" },
  warning: { box: "bg-warning-soft text-warning-ink border-[#fde68a]", dot: "bg-warning" },
  danger: { box: "bg-danger-soft text-danger-ink border-[#fecaca]", dot: "bg-danger" },
  peach: { box: "bg-peach-soft text-peach-ink border-[#fed7aa]", dot: "bg-peach" },
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone].box, className)}>
      {dot && <span className={cn("size-1.5 rounded-full", tones[tone].dot)} aria-hidden />}
      {children}
    </span>
  );
}

const CAMPAIGN_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  collecting: { tone: "success", label: "Đang thu thập" },
  stopped_target: { tone: "primary", label: "Đủ mục tiêu" },
  stopped_deadline: { tone: "neutral", label: "Hết hạn thu thập" },
  stopped: { tone: "neutral", label: "Ngừng thu thập" },
};

export function CampaignStatusBadge({ status }: { status: string }) {
  const s = CAMPAIGN_STATUS[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const CONTRIB_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  registered: { tone: "success", label: "Hợp lệ · on-chain" },
  gray: { tone: "warning", label: "Chờ duyệt" },
  pending_chain: { tone: "warning", label: "Đang ghi nhận" },
  rejected: { tone: "danger", label: "Chưa đạt" },
  revoked: { tone: "neutral", label: "Đã thu hồi" },
  failed: { tone: "danger", label: "Không ghi được" },
  submitted: { tone: "primary", label: "Đang kiểm tra" },
};

export function ContributionStatusBadge({ status }: { status: string }) {
  const s = CONTRIB_STATUS[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
