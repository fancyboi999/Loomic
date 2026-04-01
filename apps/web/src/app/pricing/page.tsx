"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { createCheckout } from "@/lib/payments-api";
import { useSubscription } from "@/hooks/use-subscription";

import type { BillingPeriod } from "./components/pricing-data";
import { PricingNav } from "./components/pricing-nav";
import { PricingHero } from "./components/pricing-hero";
import { PricingToggle } from "./components/pricing-toggle";
import { PricingCards } from "./components/pricing-cards";
import { PricingComparison } from "./components/pricing-comparison";
import { PricingFAQ } from "./components/pricing-faq";
import { PricingCTA } from "./components/pricing-cta";

function openLemonCheckout(url: string) {
  if (window.LemonSqueezy?.Url?.Open) {
    window.LemonSqueezy.Url.Open(url);
  } else {
    window.open(url, "_blank");
  }
}

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
  const { session } = useAuth();
  const { subscription } = useSubscription();

  const handleCheckout = useCallback(
    async (plan: string, period: BillingPeriod) => {
      const token = session?.access_token;
      if (!token) {
        // Redirect unauthenticated users to login
        window.location.href = "/login?redirect=/pricing";
        return;
      }

      const { checkoutUrl } = await createCheckout(token, plan, period);
      openLemonCheckout(checkoutUrl);
    },
    [session?.access_token],
  );

  const hasActiveSubscription =
    subscription?.plan && subscription.plan !== "free";

  return (
    <div className="min-h-screen bg-background">
      <PricingNav />

      <main>
        <PricingHero />

        {/* Manage subscription banner */}
        {hasActiveSubscription && (
          <div className="mx-auto mb-6 flex max-w-md items-center justify-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              You are on the{" "}
              <span className="font-medium text-foreground capitalize">
                {subscription.plan}
              </span>{" "}
              plan.
            </span>
            <Link
              href="/settings?tab=billing"
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              <Settings className="h-3.5 w-3.5" />
              Manage
            </Link>
          </div>
        )}

        {/* Billing toggle + cards */}
        <section className="px-6">
          <div className="mb-10 flex justify-center">
            <PricingToggle value={billingPeriod} onChange={setBillingPeriod} />
          </div>
          <PricingCards
            billingPeriod={billingPeriod}
            currentPlan={subscription?.plan ?? null}
            onCheckout={handleCheckout}
          />
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
