import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends ComponentProps<"div"> {
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  tone?: "default" | "soft" | "mint" | "peach";
}

const pads = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" };
const tones = {
  default: "bg-surface border-line",
  soft: "bg-primary-soft/70 border-primary-line/60",
  mint: "bg-success-soft border-[#a7f3d0]",
  peach: "bg-peach-soft border-[#fed7aa]",
};

export function Card({ interactive, padding = "md", tone = "default", className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border shadow-[var(--shadow-soft)]",
        tones[tone],
        pads[padding],
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-[var(--duration-hover)] ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:border-primary-line hover:shadow-[var(--shadow-lift)]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: ComponentProps<"h3">) {
  return <h3 className={cn("text-h3", className)} {...rest} />;
}
