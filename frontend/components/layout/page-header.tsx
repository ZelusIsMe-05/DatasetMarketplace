import Link from "next/link";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}

export function PageHeader({ title, description, eyebrow, actions, back }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 pb-8 pt-8 sm:pt-12">
      {back && (
        <Link href={back.href} transitionTypes={["nav-back"]} className="inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-semibold text-ink-muted transition-colors hover:text-primary">
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-3xl flex-col gap-2">
          {eyebrow && <div className="text-sm font-semibold text-primary">{eyebrow}</div>}
          <h1 className="text-h1">{title}</h1>
          {description && <p className="text-lead">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
