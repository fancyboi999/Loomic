"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./motion";
import { fadeUp } from "./motion";

// ---------------------------------------------------------------------------
// SectionHeader component
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
  align?: "center" | "left";
}

export function SectionHeader({
  title,
  subtitle,
  className,
  align = "center",
}: SectionHeaderProps) {
  const isCenter = align === "center";

  return (
    <ScrollReveal
      className={cn(
        "flex flex-col gap-4",
        isCenter && "items-center text-center",
        className
      )}
    >
      {/* Title */}
      <motion.h2
        variants={fadeUp}
        className={cn(
          "text-4xl md:text-5xl font-bold tracking-tight leading-tight",
          "text-foreground"
        )}
      >
        {title}
      </motion.h2>

      {/* Subtitle */}
      {subtitle && (
        <motion.p
          variants={fadeUp}
          transition={{ delay: 0.1 }}
          className={cn(
            "text-lg text-muted-foreground max-w-2xl leading-relaxed"
          )}
        >
          {subtitle}
        </motion.p>
      )}
    </ScrollReveal>
  );
}
