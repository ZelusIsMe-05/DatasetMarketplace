import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { Earnings } from "@/features/earn/earnings";

export default function EarningsPage() {
  return (
    <PageTransition>
      <RequireContributor>
        <Earnings />
      </RequireContributor>
    </PageTransition>
  );
}
