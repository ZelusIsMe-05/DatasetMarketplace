import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { AdminConsole } from "@/features/admin/admin-console";

export const metadata: Metadata = { title: "Bảng điều khiển QC", robots: { index: false } };

export default function AdminPage() {
  return (
    <PageTransition>
      <div className="container-page">
        <PageHeader eyebrow="Vận hành" title="Bảng điều khiển QC" description="Duyệt bản ghi vùng xám, công bố phiên bản dataset và theo dõi relayer." />
        <AdminConsole />
      </div>
    </PageTransition>
  );
}
