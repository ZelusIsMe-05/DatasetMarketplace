import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Explore } from "@/features/marketplace/explore";

export const metadata: Metadata = { title: "Khám phá bộ dữ liệu" };

export default function ExplorePage() {
  return (
    <PageTransition>
      <div className="container-page">
        <PageHeader eyebrow="Chợ dữ liệu giọng nói" title="Khám phá bộ dữ liệu" description="Mua sớm khi chiến dịch đang thu thập để có giá thấp hơn. License và mọi phiên bản dữ liệu đều có bằng chứng trên Avalanche." />
      </div>
      <Explore />
    </PageTransition>
  );
}
