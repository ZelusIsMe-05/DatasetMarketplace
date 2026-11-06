import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { Skeleton } from "@/components/ui/states";
import { RecordStudio } from "@/features/earn/record-studio";

export const metadata: Metadata = { title: "Phòng ghi âm" };

export default function RecordPage(props: PageProps<"/earn/campaigns/[id]/record">) {
  return (
    <PageTransition>
      <Suspense fallback={<Skeleton className="mx-auto mt-8 h-96 max-w-3xl" />}>
        <RequireContributor>
          <RecordStudio params={props.params} />
        </RequireContributor>
      </Suspense>
    </PageTransition>
  );
}
