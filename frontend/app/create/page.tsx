import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { CreatorDashboard } from "@/features/creator/creator-dashboard";
import { CreatorGate } from "@/features/creator/wallet-login";

export const metadata: Metadata = { title: "Bảng điều khiển người tạo" };

export default function CreatePage() {
  return (
    <PageTransition>
      <div className="container-page">
        <PageHeader eyebrow="Người tạo chiến dịch" title="Đặt hàng & theo dõi dữ liệu" description="Theo dõi tiến độ thu thập, doanh thu và rút phần được chia của các chiến dịch do ví bạn tạo." />
        <CreatorGate>
          <CreatorDashboard />
        </CreatorGate>
      </div>
    </PageTransition>
  );
}
