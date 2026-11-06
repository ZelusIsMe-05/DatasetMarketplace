import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { RequireContributor } from "@/features/earn/earn-shell";
import { Skeleton } from "@/components/ui/states";
import { CampaignJoin } from "@/features/earn/campaign-join";

export default function EarnCampaignPage(props: PageProps<"/earn/campaigns/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <RequireContributor>
          <CampaignJoin params={props.params} />
        </RequireContributor>
      </Suspense>
    </PageTransition>
  );
}
