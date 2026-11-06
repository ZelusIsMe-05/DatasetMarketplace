import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/states";
import { EarnShell } from "@/features/earn/earn-shell";

export const metadata: Metadata = { title: "Kiếm tiền bằng giọng nói" };

export default function EarnLayout({ children }: LayoutProps<"/earn">) {
  return (
    <Suspense fallback={<div className="container-page py-12"><Skeleton className="h-64" /></div>}>
      <EarnShell>{children}</EarnShell>
    </Suspense>
  );
}
