import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { EarnDashboard } from "@/features/earn/dashboard";

export default function EarnPage() {
  return (
    <PageTransition>
      <RequireContributor>
        <EarnDashboard />
      </RequireContributor>
    </PageTransition>
  );
}
