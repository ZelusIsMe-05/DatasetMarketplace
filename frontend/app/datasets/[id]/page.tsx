import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { DatasetDetail, DetailSkeleton } from "@/features/marketplace/dataset-detail";

// Cache Components: không await params ở page; truyền promise xuống component client trong <Suspense>.
export default function DatasetPage(props: PageProps<"/datasets/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<DetailSkeleton />}>
        <DatasetDetail params={props.params} />
      </Suspense>
    </PageTransition>
  );
}
