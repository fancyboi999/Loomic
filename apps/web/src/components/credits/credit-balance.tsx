"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Plus, ChevronRight, Zap, Gift } from "lucide-react";
import Link from "next/link";
import { useCredits } from "@/hooks/use-credits";

// ── Animated number display ──────────────────────────────────

function AnimatedBalance({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === value) return;

    const diff = value - prev;
    const steps = Math.min(Math.abs(diff), 20);
    const stepTime = Math.max(30, 400 / steps);
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      // Ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(prev + diff * eased));
      if (step >= steps) {
        clearInterval(timer);
        setDisplayed(value);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayed.toLocaleString()}</span>;
}

// ── Plan badge color map ─────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: "bg-neutral-700 text-neutral-300",
  starter: "bg-blue-900/60 text-blue-300",
  pro: "bg-violet-900/60 text-violet-300",
  ultra: "bg-amber-900/60 text-amber-300",
  business: "bg-emerald-900/60 text-emerald-300",
};

// ── Main component ───────────────────────────────────────────

export function CreditBalance() {
  const { balance, plan, dailyClaimed, limits, loading, claimDaily } =
    useCredits();

  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
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

  // Position popover to the right of the sidebar button
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      bottom: window.innerHeight - rect.bottom - 4,
      left: rect.right + 12,
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

  if (loading) {
    return (
      <div className="flex h-9 w-9 items-center justify-center">
        <div className="h-4 w-4 animate-pulse rounded-full bg-neutral-700" />
      </div>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${balance} credits`}
        className="relative flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-full transition-colors hover:bg-muted"
      >
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-[9px] font-medium leading-none text-muted-foreground tabular-nums">
          {balance > 9999 ? `${Math.floor(balance / 1000)}k` : balance}
        </span>

        {/* Pulsing claim indicator */}
        {canClaim && (
          <motion.span
            className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Plus className="h-2 w-2 text-white" strokeWidth={3} />
          </motion.span>
        )}
      </button>

      {/* Popover */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <div ref={popoverRef} style={popoverStyle}>
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="w-64 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl"
              >
              {/* Balance section */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                  <span className="text-2xl font-semibold tabular-nums text-white">
                    <AnimatedBalance value={balance} />
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Available credits
                </p>
              </div>

              {/* Plan badge */}
              <div className="mb-3 flex items-center gap-2">
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

              {/* Divider */}
              <div className="mb-3 h-px bg-neutral-800" />

              {/* Claim daily button (free plan, unclaimed) */}
              {canClaim && (
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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

              {/* Already claimed indicator */}
              {isFree && dailyClaimed && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Daily credits claimed
                </div>
              )}

              {/* Upgrade link */}
              {plan !== "business" && (
                <Link
                  href="/pricing"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-violet-400" />
                    Upgrade Plan
                  </span>
                  <ChevronRight className="h-4 w-4 text-neutral-600" />
                </Link>
              )}
              </motion.div>
            </div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
