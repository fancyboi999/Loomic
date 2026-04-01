"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";

export function BillingSection() {
  const { subscription, loading, error, cancel } = useSubscription();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancel();
      setCancelConfirmOpen(false);
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Failed to cancel subscription",
      );
    } finally {
      setCancelling(false);
    }
  }, [cancel]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading billing info...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        Failed to load subscription info. Please try again later.
      </div>
    );
  }

  const plan = subscription?.plan ?? "free";
  const isFree = plan === "free";
  const isCancelled = !!subscription?.canceledAt;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and billing details.
        </p>
      </div>

      {/* Current plan card */}
      <div className="rounded-lg border p-5">
        <div className="flex items-center gap-2 mb-1">
          <Crown className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Current Plan</span>
        </div>
        <p className="text-2xl font-bold capitalize">{plan}</p>

        {subscription?.billingPeriod && (
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {subscription.billingPeriod} billing
          </p>
        )}

        {subscription?.currentPeriodEnd && !isFree && (
          <p className="mt-1 text-sm text-muted-foreground">
            {isCancelled ? "Access until" : "Next billing date"}:{" "}
            <span className="font-medium text-foreground">
              {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                undefined,
                { year: "numeric", month: "long", day: "numeric" },
              )}
            </span>
          </p>
        )}

        {isCancelled && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Subscription cancelled. Access continues until the end of the
            billing period.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/pricing">
          <Button variant="default" size="lg">
            <CreditCard className="mr-1.5 h-4 w-4" />
            {isFree ? "Upgrade Plan" : "Change Plan"}
          </Button>
        </Link>

        {subscription?.customerPortalUrl && (
          <a
            href={subscription.customerPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="lg">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Manage Billing
            </Button>
          </a>
        )}

        {!isFree && !isCancelled && (
          <Button
            variant="destructive"
            size="lg"
            onClick={() => setCancelConfirmOpen(true)}
          >
            Cancel Subscription
          </Button>
        )}
      </div>

      {/* Cancel confirmation dialog */}
      <AnimatePresence>
        {cancelConfirmOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cancelling && setCancelConfirmOpen(false)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-lg"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold">Cancel Subscription?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Your subscription will remain active until the end of the
                current billing period. After that, you will be downgraded to
                the Free plan.
              </p>

              {cancelError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {cancelError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCancelConfirmOpen(false)}
                  disabled={cancelling}
                >
                  Keep Subscription
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  Confirm Cancel
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
