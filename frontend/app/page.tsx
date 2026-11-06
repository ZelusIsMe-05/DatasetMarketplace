import { PageTransition } from "@/components/layout/page-transition";
import { Hero } from "@/features/landing/hero";
import { FeaturedCampaigns, LiveStats } from "@/features/landing/live-campaigns";
import { RevenueSimulator } from "@/features/landing/revenue-simulator";
import { Audiences, ConsentStory, CtaBand, Faq, HowItWorks } from "@/features/landing/sections";

export default function Home() {
  return (
    <PageTransition>
      <Hero />
      <LiveStats />
      <HowItWorks />
      <Audiences />
      <RevenueSimulator />
      <ConsentStory />
      <FeaturedCampaigns />
      <Faq />
      <CtaBand />
    </PageTransition>
  );
}
