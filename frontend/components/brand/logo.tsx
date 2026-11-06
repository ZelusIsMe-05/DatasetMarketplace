import { cn } from "@/lib/cn";
import { BRAND } from "@/lib/brand";

/** Biểu tượng thương hiệu: bong bóng lời nói chứa sóng âm. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id="gq-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M8 4h24a6 6 0 016 6v15a6 6 0 01-6 6H19l-7.5 6.2c-.8.6-1.9.1-1.9-.9V31H8a6 6 0 01-6-6V10a6 6 0 016-6z" fill="url(#gq-logo)" />
      {[11, 16, 21, 26, 31].map((x, i) => {
        const h = [6, 12, 16, 10, 5][i];
        return <rect key={x} x={x - 1.4} y={17.5 - h / 2} width="2.8" height={h} rx="1.4" fill="#fff" opacity={i === 2 ? 1 : 0.9} />;
      })}
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="whitespace-nowrap text-lg font-bold tracking-tight text-ink">
        {/* Có khoảng trắng thật giữa hai phần: tên hiển thị phải khớp tên truy cập (WCAG 2.5.3) */}
        {BRAND.wordmark[0]} <span className="text-primary">{BRAND.wordmark[1]}</span>
      </span>
    </span>
  );
}
