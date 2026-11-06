import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { CreateWizard } from "@/features/creator/create-wizard";
import { CreatorGate } from "@/features/creator/wallet-login";

export const metadata: Metadata = { title: "Tạo chiến dịch mới" };

export default function NewCampaignPage() {
  return (
    <PageTransition>
      <div className="container-page">
        <PageHeader back={{ href: "/create", label: "Bảng điều khiển" }} eyebrow="Chiến dịch mới" title="Đặt hàng một bộ dữ liệu giọng nói" description="Năm bước ngắn. Bạn xem lại toàn bộ cấu hình trước khi ký giao dịch." />
        <CreatorGate>
          <CreateWizard />
        </CreatorGate>
      </div>
    </PageTransition>
  );
}
