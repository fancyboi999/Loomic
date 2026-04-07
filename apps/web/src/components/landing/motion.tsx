"use client";

import {
  motion,
  type Variants,
  type HTMLMotionProps,
} from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const blurIn: Variants = {
  hidden: { opacity: 0, filter: "blur(12px)", y: 20 },
  visible: {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    transition: { duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const scaleUp: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// ---------------------------------------------------------------------------
// Helpers — reduced-motion aware instant variant builder
// ---------------------------------------------------------------------------

function useInstantVariants(variants: Variants): Variants {
  const shouldReduce = useReducedMotion();
  if (!shouldReduce) return variants;

  // Collapse hidden → visible instantly (no translation/blur/scale)
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.01 } },
  };
}

// ---------------------------------------------------------------------------
// ScrollReveal
// ---------------------------------------------------------------------------

interface ScrollRevealProps extends HTMLMotionProps<"div"> {
  variants?: Variants;
  /** Distance from viewport edge that triggers the animation */
  margin?: string;
  className?: string | undefined;
  children: React.ReactNode;
}

export function ScrollReveal({
  variants = fadeUp,
  margin = "-80px",
  className,
  children,
  ...rest
}: ScrollRevealProps) {
  const safeVariants = useInstantVariants(variants);

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin }}
      variants={safeVariants}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StaggerContainer
// ---------------------------------------------------------------------------

interface StaggerContainerProps extends HTMLMotionProps<"div"> {
  className?: string;
  children: React.ReactNode;
  /** Distance from viewport edge that triggers the animation */
  margin?: string;
}

export function StaggerContainer({
  className,
  children,
  margin = "-80px",
  ...rest
}: StaggerContainerProps) {
  const shouldReduce = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin }}
      variants={shouldReduce ? {} : stagger}
      className={cn(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Shorthands
// ---------------------------------------------------------------------------

export function FadeUp({
  className,
  children,
  ...rest
}: Omit<ScrollRevealProps, "variants">) {
  return (
    <ScrollReveal variants={fadeUp} className={className} {...rest}>
      {children}
    </ScrollReveal>
  );
}

export function BlurIn({
  className,
  children,
  ...rest
}: Omit<ScrollRevealProps, "variants">) {
  return (
    <ScrollReveal variants={blurIn} className={className} {...rest}>
      {children}
    </ScrollReveal>
  );
}
