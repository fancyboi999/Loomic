"use client";

import { useCallback } from "react";

import { useTierLimitToast } from "@/components/credits/tier-limit-toast";
import { ApiApplicationError } from "@/lib/server-api";
import { useToast } from "@/components/toast";

const TIER_LIMIT_CODES = new Set([
  "concurrency_limit",
  "model_not_accessible",
  "resolution_not_allowed",
]);

/**
 * Returns a handler function that inspects generation errors and routes them
 * to the appropriate UI:
 * - `insufficient_credits` -> returns "insufficient_credits" so caller can open CreditInsufficientDialog
 * - tier limit codes -> shows tier-limit toast (handled internally)
 * - other errors -> shows generic error toast
 *
 * @returns handleGenerationError(error) => boolean — true if the error was a
 *          known tier/credit limit (i.e. caller should NOT show its own error UI)
 */
export function useGenerationErrorHandler() {
  const { showTierLimit } = useTierLimitToast();
  const { error: showErrorToast } = useToast();

  const handleGenerationError = useCallback(
    (error: unknown): boolean => {
      if (!(error instanceof ApiApplicationError)) {
        // Not an application error — let caller handle or show generic toast
        const msg = error instanceof Error ? error.message : "Generation failed";
        showErrorToast(msg);
        return false;
      }

      // Credit-insufficient: caller should open CreditInsufficientDialog
      if (error.code === "insufficient_credits") {
        return true;
      }

      // Tier limit errors: show toast notification
      if (TIER_LIMIT_CODES.has(error.code)) {
        showTierLimit({ code: error.code, message: error.message });
        return true;
      }

      // Other application errors: generic toast
      showErrorToast(error.message);
      return false;
    },
    [showTierLimit, showErrorToast],
  );

  return { handleGenerationError };
}
