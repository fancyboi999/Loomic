"use client";

import dynamic from "next/dynamic";
import { FloatingNav } from "@/components/landing/floating-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { TrustBar } from "@/components/landing/trust-bar";

// ---------------------------------------------------------------------------
// Below-fold sections — lazy-loaded via next/dynamic to reduce initial bundle.
// Each section is its own chunk, loaded when React renders the component.
// Combined with IntersectionObserver inside motion.tsx (whileInView), these
// chunks are requested only as the user scrolls near them.
// ---------------------------------------------------------------------------

const FeatureShowcase = dynamic(
  () =>
    import("@/components/landing/feature-showcase").then(
      (m) => m.FeatureShowcase,
    ),
  { ssr: false },
);

const ShowcaseGallery = dynamic(
  () =>
    import("@/components/landing/showcase-gallery").then(
      (m) => m.ShowcaseGallery,
    ),
  { ssr: false },
);

const HowItWorks = dynamic(
  () =>
    import("@/components/landing/how-it-works").then((m) => m.HowItWorks),
  { ssr: false },
);

const PricingPreview = dynamic(
  () =>
    import("@/components/landing/pricing-preview").then(
      (m) => m.PricingPreview,
    ),
  { ssr: false },
);

const FinalCTA = dynamic(
  () => import("@/components/landing/final-cta").then((m) => m.FinalCTA),
  { ssr: false },
);

const LandingFooter = dynamic(
  () =>
    import("@/components/landing/landing-footer").then(
      (m) => m.LandingFooter,
    ),
  { ssr: false },
);

export default function LandingPage() {
  return (
    <div className="relative">
      <FloatingNav />
      <main>
        {/* Above-fold: eagerly loaded for fast LCP */}
        <HeroSection />
        <TrustBar />

        {/* Below-fold: code-split, loaded on demand */}
        <FeatureShowcase />
        <ShowcaseGallery />
        <HowItWorks />
        <PricingPreview />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
