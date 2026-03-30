"use client";

import { useState } from "react";
import type { BillingPeriod } from "./components/pricing-data";
import { PricingNav } from "./components/pricing-nav";
import { PricingHero } from "./components/pricing-hero";
import { PricingToggle } from "./components/pricing-toggle";
import { PricingCards } from "./components/pricing-cards";
import { PricingComparison } from "./components/pricing-comparison";
import { PricingFAQ } from "./components/pricing-faq";
import { PricingCTA } from "./components/pricing-cta";

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");

  return (
    <div className="min-h-screen bg-background">
      <PricingNav />

      <main>
        <PricingHero />

        {/* Billing toggle + cards */}
        <section className="px-6">
          <div className="mb-10 flex justify-center">
            <PricingToggle value={billingPeriod} onChange={setBillingPeriod} />
          </div>
          <PricingCards billingPeriod={billingPeriod} />
        </section>

        {/* Feature comparison */}
        <div id="features">
          <PricingComparison />
        </div>

        <PricingFAQ />
        <PricingCTA />
      </main>
    </div>
  );
}
