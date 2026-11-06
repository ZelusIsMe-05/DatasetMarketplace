import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="surface-card flex flex-col gap-3 p-5" aria-hidden>
      <Skeleton className="h-5 w-2/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : "w-full")} />
      ))}
    </div>
  );
}

export function LoadingBlock({ label = "Đang tải…", children }: { label?: string; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">{label}</span>
      {children ?? <SkeletonCard />}
    </div>
  );
}

interface StateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, illustration, className }: StateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center", className)}>
      {illustration ?? <EmptyArt />}
      <h3 className="text-h3">{title}</h3>
      {description && <p className="max-w-md text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Không tải được dữ liệu", description, onRetry, className }: Omit<StateProps, "title"> & { title?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[#fecaca] bg-danger-soft px-6 py-10 text-center", className)}>
      <svg viewBox="0 0 48 48" className="size-12 text-danger" fill="none" aria-hidden>
        <circle cx="24" cy="24" r="20" fill="currentColor" opacity="0.12" />
        <path d="M24 14v12M24 32v.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
      <h3 className="text-h3 text-danger-ink">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-soft">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

function EmptyArt() {
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-28" aria-hidden>
      <rect x="8" y="10" width="104" height="44" rx="14" fill="#eff6ff" />
      {[18, 30, 42, 54, 66, 78, 90, 102].map((x, i) => (
        <rect key={x} x={x - 2} y={32 - [6, 12, 18, 10, 20, 8, 14, 6][i]} width="4" height={[6, 12, 18, 10, 20, 8, 14, 6][i] * 2} rx="2" fill={i % 3 === 0 ? "#06b6d4" : "#93c5fd"} />
      ))}
    </svg>
  );
}
