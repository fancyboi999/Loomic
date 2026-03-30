"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { BillingPeriod, PricingTier } from "./pricing-data";
import { cardReveal } from "./pricing-data";

interface PricingCardProps {
  tier: PricingTier;
  billingPeriod: BillingPeriod;
  index: number;
}

export function PricingCard({ tier, billingPeriod, index }: PricingCardProps) {
  const price =
    billingPeriod === "monthly" ? tier.monthlyPrice : tier.yearlyPrice;

  return (
    <motion.div
      variants={cardReveal}
      custom={index}
      whileHover={{ y: -6 }}
      className={`bg-card relative flex flex-col rounded-2xl p-6 transition-shadow lg:p-8 ${
        tier.highlighted
          ? "shadow-card-hover z-10 scale-[1.02] border-2"
          : "shadow-card hover:shadow-card-hover border"
      }`}
      style={
        tier.highlighted
          ? {
              borderColor: "oklch(0.90 0.17 115)",
              boxShadow: "0 0 20px oklch(0.90 0.17 115 / 0.15)",
            }
          : undefined
      }
    >
      {/* Badge */}
      {tier.badge && (
        <span className="bg-accent text-accent-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap">
          {tier.badge}
        </span>
      )}

      {/* Name */}
      <h3 className="text-foreground text-lg font-semibold">{tier.name}</h3>

      {/* Description */}
      <p className="text-muted-foreground mt-1 text-sm">{tier.description}</p>

      {/* Price */}
      <div className="mt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tier.id}-${billingPeriod}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex items-baseline gap-1"
          >
            <span className="text-foreground text-4xl font-bold">
              ${price}
            </span>
            <span className="text-muted-foreground text-sm">/月</span>
          </motion.div>
        </AnimatePresence>
        {billingPeriod === "yearly" && tier.yearlyPrice > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">按年付费</p>
        )}
      </div>

      {/* Credit label */}
      <p className="text-muted-foreground mt-2 text-sm">{tier.creditLabel}</p>

      {/* Divider */}
      <div className="bg-border my-5 h-px" />

      {/* Features */}
      <ul className="flex-1 space-y-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="text-foreground mt-0.5 size-4 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-6">
        {tier.ctaVariant === "accent" ? (
          <Button
            className="w-full cursor-pointer"
            size="lg"
            style={{
              backgroundColor: "oklch(0.90 0.17 115)",
              color: "oklch(0.205 0 0)",
              borderColor: "oklch(0.90 0.17 115)",
            }}
          >
            {tier.cta}
          </Button>
        ) : (
          <Button
            className="w-full cursor-pointer"
            size="lg"
            variant={tier.ctaVariant === "outline" ? "outline" : "default"}
          >
            {tier.cta}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
