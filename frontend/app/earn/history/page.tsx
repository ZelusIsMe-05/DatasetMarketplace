import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { History } from "@/features/earn/history";

export default function HistoryPage() {
  return (
    <PageTransition>
      <RequireContributor>
        <History />
      </RequireContributor>
    </PageTransition>
  );
}
