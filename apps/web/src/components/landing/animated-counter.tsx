"use client";

import { useEffect, useRef, useState } from "react";
import {
  useMotionValue,
  useTransform,
  animate,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// AnimatedCounter component
// ---------------------------------------------------------------------------

interface AnimatedCounterProps {
  /** Target number to count up to */
  target: number;
  /** Animation duration in milliseconds (default: 2000) */
  duration?: number;
  /** Appended after the number, e.g. "+" */
  suffix?: string;
  /** Prepended before the number, e.g. "$" */
  prefix?: string;
  className?: string;
}

export function AnimatedCounter({
  target,
  duration = 2000,
  suffix = "",
  prefix = "",
  className,
}: AnimatedCounterProps) {
  const shouldReduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(
    shouldReduce ? formatNumber(target) : "0"
  );

  // Subscribe to the motion value and update display string
  useEffect(() => {
    const unsubscribe = motionValue.on("change", (v) => {
      setDisplay(formatNumber(v));
    });
    return unsubscribe;
  }, [motionValue]);

  // Trigger animation when in view
  useEffect(() => {
    if (!isInView) return;

    if (shouldReduce) {
      setDisplay(formatNumber(target));
      return;
    }

    const controls = animate(motionValue, target, {
      duration: duration / 1000,
      ease: [0.25, 0.46, 0.45, 0.94],
    });

    return () => controls.stop();
  }, [isInView, target, duration, motionValue, shouldReduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
