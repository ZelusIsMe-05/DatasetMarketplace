import type { Money } from "@/types/api";
import { cn } from "@/lib/cn";

/** VNĐ là dòng chính (có "≈" vì theo tỷ giá), số token on-chain là dòng phụ nhỏ (đề xuất §8.4). */
export function MoneyText({ value, size = "md", className, align = "left" }: { value: Money; size?: "sm" | "md" | "lg" | "xl"; className?: string; align?: "left" | "right" }) {
  const main = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl sm:text-4xl" }[size];
  return (
    <span className={cn("inline-flex flex-col leading-tight", align === "right" && "items-end", className)}>
      <span className={cn("tabular font-bold tracking-tight text-ink", main)}>{value.display}</span>
      <span className="mt-0.5 text-xs text-ink-muted">{value.token}</span>
    </span>
  );
}
