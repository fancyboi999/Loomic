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
  starter: "bg-blue-900/40 text-blue-400",
  pro: "bg-violet-900/40 text-violet-400",
  ultra: "bg-amber-900/40 text-amber-400",
  business: "bg-emerald-900/40 text-emerald-400",
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
