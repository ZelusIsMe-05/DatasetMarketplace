import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { Library } from "@/features/marketplace/library";

export const metadata: Metadata = { title: "Thư viện của tôi" };

export default function LibraryPage() {
  return (
    <PageTransition>
      <div className="container-page">
        <PageHeader eyebrow="Người mua" title="Thư viện của tôi" description="Các bộ dữ liệu ví của bạn đã mua license. Mỗi lần tải là phiên bản mới nhất, đã loại các bản ghi bị thu hồi." />
      </div>
      <Library />
    </PageTransition>
  );
}
