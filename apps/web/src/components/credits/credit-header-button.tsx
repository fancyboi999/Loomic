// @credits-system — Header button showing credit balance + upgrade CTA (Lovart style)
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronRight, Gift } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/hooks/use-credits";

// ── Plan badge color map ─────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: "bg-neutral-200 text-neutral-600",
  starter: "bg-neutral-800 text-neutral-200",
  pro: "bg-neutral-900 text-white",
  ultra: "bg-neutral-900 text-neutral-100",
  business: "bg-neutral-900 text-white",
};

// ── Main component ───────────────────────────────────────────

export function CreditHeaderButton() {
  const { user } = useAuth();
  const { balance, plan, dailyClaimed, limits, loading, claimDaily } =
    useCredits();

  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Position popover below button
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
      zIndex: 9999,
    });
  }, [open]);

  const handleClaim = async () => {
    setClaiming(true);
    await claimDaily();
    setClaiming(false);
  };

  const isFree = plan === "free";
  const canClaim = isFree && !dailyClaimed;
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "User";

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 animate-pulse rounded-full bg-neutral-200" />
      </div>
    );
  }

  return (
    <>
      <div ref={btnRef} className="flex items-center gap-2">
        {/* Upgrade button (non-business plans) */}
        {plan !== "business" && (
          <Link
            href="/pricing"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Zap className="h-3 w-3 text-neutral-500" />
            <span>升级</span>
          </Link>
        )}

        {/* Credit balance button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-xs font-medium tabular-nums text-neutral-700 transition-colors hover:bg-neutral-200"
        >
          <Zap className="h-3 w-3 text-neutral-500 fill-neutral-500" />
          <span>{balance.toLocaleString()}</span>
        </button>

        {/* User avatar */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full border border-neutral-200 object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-xs font-medium text-neutral-600">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Popover */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <div ref={popoverRef} style={popoverStyle}>
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
              >
                {/* Plan badge + balance */}
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}
                  >
                    {plan}
                  </span>
                  {limits && (
                    <span className="text-xs text-neutral-500">
                      {isFree
                        ? `${limits.dailyCredits}/day`
                        : `${limits.monthlyCredits.toLocaleString()}/mo`}
                    </span>
                  )}
                </div>

                {/* Balance */}
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="h-5 w-5 text-neutral-500" />
                  <span className="text-2xl font-semibold tabular-nums text-neutral-900">
                    {balance.toLocaleString()}
                  </span>
                  <span className="text-xs text-neutral-500">credits</span>
                </div>

                <div className="mb-3 h-px bg-neutral-200" />

                {/* Claim daily (free plan, unclaimed) */}
                {canClaim && (
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={claiming}
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {claiming ? (
                      <motion.div
                        className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      />
                    ) : (
                      <Gift className="h-4 w-4" />
                    )}
                    {claiming ? "Claiming..." : "Claim Daily Credits"}
                  </button>
                )}

                {/* Already claimed */}
                {isFree && dailyClaimed && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
                    <Zap className="h-3.5 w-3.5 text-neutral-500" />
                    Daily credits claimed
                  </div>
                )}

                {/* Usage details link */}
                <Link
                  href="/settings?tab=usage"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                  <span>Usage Details</span>
                  <ChevronRight className="h-4 w-4 text-neutral-400" />
                </Link>
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
