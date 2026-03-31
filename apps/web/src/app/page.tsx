"use client";

import { FloatingNav } from "@/components/landing/floating-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { TrustBar } from "@/components/landing/trust-bar";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { ShowcaseGallery } from "@/components/landing/showcase-gallery";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PricingPreview } from "@/components/landing/pricing-preview";
import { FinalCTA } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
  return (
    <div className="relative">
      <FloatingNav />
      <main>
        <HeroSection />
        <TrustBar />
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
