import type { Money } from "@/types/api";
import { cn } from "@/lib/cn";

/** Chỉ hiển thị VNĐ (có "≈" vì theo tỷ giá) — số token on-chain không hiện cho người dùng (implementation-plan §3 #31). */
export function MoneyText({ value, size = "md", className, align = "left" }: { value: Money; size?: "sm" | "md" | "lg" | "xl"; className?: string; align?: "left" | "right" }) {
  const main = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl sm:text-4xl" }[size];
  return (
    <span className={cn("inline-flex flex-col leading-tight", align === "right" && "items-end", className)}>
      <span className={cn("tabular font-bold tracking-tight text-ink", main)}>{value.display}</span>
    </span>
  );
}
