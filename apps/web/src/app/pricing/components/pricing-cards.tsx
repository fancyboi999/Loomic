"use client";

import { motion } from "framer-motion";

import type { BillingPeriod } from "./pricing-data";
import { pricingTiers, staggerContainer } from "./pricing-data";
import { PricingCard } from "./pricing-card";

interface PricingCardsProps {
  billingPeriod: BillingPeriod;
  currentPlan?: string | null | undefined;
  onCheckout?: ((plan: string, billingPeriod: BillingPeriod) => Promise<void>) | undefined;
}

export function PricingCards({
  billingPeriod,
  currentPlan,
  onCheckout,
}: PricingCardsProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-3 xl:grid-cols-5"
    >
      {pricingTiers.map((tier, index) => (
        <PricingCard
          key={tier.id}
          tier={tier}
          billingPeriod={billingPeriod}
          index={index}
          {...(currentPlan !== undefined ? { currentPlan } : {})}
          {...(onCheckout !== undefined ? { onCheckout } : {})}
        />
      ))}
    </motion.div>
  );
}
