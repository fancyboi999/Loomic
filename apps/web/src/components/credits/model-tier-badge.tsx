// @credits-system — Model tier badge: displays credit cost, plan tier, and lock for inaccessible models
"use client";

import { Lock } from "lucide-react";
import type { SubscriptionPlan } from "@loomic/shared";

interface ModelTierBadgeProps {
  creditCost: number;
  accessible: boolean;
  minTier: SubscriptionPlan;
}

const TIER_BADGE_STYLES: Record<string, string> = {
  free: "",
  starter: "bg-neutral-700/40 text-neutral-400",
  pro: "bg-neutral-600/40 text-neutral-300",
  ultra: "bg-neutral-500/40 text-neutral-200",
  business: "bg-neutral-500/40 text-neutral-200",
};

export function ModelTierBadge({
  creditCost,
  accessible,
  minTier,
}: ModelTierBadgeProps) {
  const showTierBadge = minTier !== "free";

  return (
    <span className="inline-flex items-center gap-1.5">
      {/* Credit cost */}
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {creditCost} cr
      </span>

      {/* Tier badge (if not free) */}
      {showTierBadge && (
        <span
          className={`inline-flex items-center rounded px-1 py-px text-[9px] font-semibold uppercase leading-tight tracking-wider ${TIER_BADGE_STYLES[minTier] ?? ""}`}
        >
          {minTier}
        </span>
      )}

      {/* Lock icon if inaccessible */}
      {!accessible && (
        <Lock className="h-3 w-3 text-neutral-500" />
      )}
    </span>
  );
}
