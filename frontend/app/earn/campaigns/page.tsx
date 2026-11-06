import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { EarnCampaigns } from "@/features/earn/dashboard";

export default function EarnCampaignsPage() {
  return (
    <PageTransition>
      <RequireContributor>
        <EarnCampaigns />
      </RequireContributor>
    </PageTransition>
  );
}
