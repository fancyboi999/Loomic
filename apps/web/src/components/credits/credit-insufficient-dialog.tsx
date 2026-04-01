"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Gift, Loader2, Zap, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { createCheckout } from "@/lib/payments-api";

interface CreditInsufficientDialogProps {
  open: boolean;
  onClose: () => void;
  currentBalance: number;
  requiredAmount: number;
  plan: string;
  dailyClaimed: boolean;
  onClaimDaily?: () => Promise<void>;
}

function openLemonCheckout(url: string) {
  if (window.LemonSqueezy?.Url?.Open) {
    window.LemonSqueezy.Url.Open(url);
  } else {
    window.open(url, "_blank");
  }
}

export function CreditInsufficientDialog({
  open,
  onClose,
  currentBalance,
  requiredAmount,
  plan,
  dailyClaimed,
  onClaimDaily,
}: CreditInsufficientDialogProps) {
  const { session } = useAuth();
  const accessTokenRef = useRef(session?.access_token);
  accessTokenRef.current = session?.access_token;

  const isFree = plan === "free";
  const canClaim = isFree && !dailyClaimed && !!onClaimDaily;
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) {
      window.location.href = "/pricing";
      return;
    }

    setUpgrading(true);
    try {
      // Default to Pro monthly as the recommended upgrade path
      const { checkoutUrl } = await createCheckout(token, "pro", "monthly");
      onClose();
      openLemonCheckout(checkoutUrl);
    } catch {
      // Fallback to pricing page on error
      window.location.href = "/pricing";
    } finally {
      setUpgrading(false);
    }
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className="fixed left-1/2 top-1/2 z-[10001] w-[380px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon */}
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>

            {/* Heading */}
            <h3 className="mb-1 text-lg font-semibold text-white">
              Not Enough Credits
            </h3>
            <p className="mb-4 text-sm text-neutral-400">
              This generation requires{" "}
              <span className="font-medium text-white">{requiredAmount}</span>{" "}
              credits, but you only have{" "}
              <span className="font-medium text-white">
                {currentBalance}
              </span>
              .
            </p>

            {/* Balance comparison */}
            <div className="mb-5 flex items-center justify-between rounded-lg bg-neutral-800/60 px-4 py-3">
              <div className="text-center">
                <p className="text-xs text-neutral-500">Required</p>
                <p className="text-lg font-semibold tabular-nums text-red-400">
                  {requiredAmount}
                </p>
              </div>
              <div className="text-neutral-600">/</div>
              <div className="text-center">
                <p className="text-xs text-neutral-500">Available</p>
                <p className="text-lg font-semibold tabular-nums text-white">
                  {currentBalance}
                </p>
              </div>
              <div className="text-neutral-600">=</div>
              <div className="text-center">
                <p className="text-xs text-neutral-500">Needed</p>
                <p className="text-lg font-semibold tabular-nums text-amber-400">
                  {requiredAmount - currentBalance}
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-2">
              {canClaim && (
                <button
                  type="button"
                  onClick={async () => {
                    await onClaimDaily();
                    onClose();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  <Gift className="h-4 w-4" />
                  Claim Daily Credits
                </button>
              )}
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {upgrading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Upgrade Plan
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
