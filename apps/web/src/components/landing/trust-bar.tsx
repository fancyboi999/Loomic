"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/landing/animated-counter";
import { StaggerContainer, FadeUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Stat item data
// ---------------------------------------------------------------------------

interface StatItem {
  target: number;
  suffix: string;
  label: string;
  decimals?: boolean;
}

const STATS: StatItem[] = [
  { target: 10000, suffix: "+", label: "创作者" },
  { target: 100000, suffix: "+", label: "设计作品" },
  { target: 50, suffix: "+", label: "AI 模型" },
  { target: 99.9, suffix: "%", label: "服务可用性", decimals: true },
];

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({ stat, isLast }: { stat: StatItem; isLast: boolean }) {
  return (
    <>
      <FadeUp className="flex flex-col items-center gap-1.5 group">
        {/* Number — subtle glow on counter complete */}
        <span
          className="text-3xl md:text-4xl font-bold text-foreground tabular-nums tracking-tight"
          style={{
            textShadow: "0 0 20px oklch(0.90 0.17 115 / 0.15)",
          }}
        >
          <AnimatedCounter
            target={stat.target}
            suffix={stat.suffix}
            duration={stat.decimals ? 1800 : 2000}
          />
        </span>

        {/* Divider line — subtle accent on hover */}
        <div
          className={cn(
            "h-px w-8 rounded-full transition-all duration-300",
            "bg-border group-hover:bg-accent/50 group-hover:w-12"
          )}
        />

        {/* Label */}
        <span className="text-sm text-muted-foreground mt-0.5">{stat.label}</span>
      </FadeUp>

      {/* Vertical separator between stats (hidden on last) */}
      {!isLast && (
        <div
          className="hidden md:block h-8 w-px shrink-0"
          style={{ background: "oklch(0.556 0 0 / 0.15)" }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// TrustBar
// ---------------------------------------------------------------------------

export function TrustBar() {
  return (
    <section
      className={cn(
        "py-16 md:py-24",
        "border-y border-border/50"
      )}
      style={{
        background:
          "linear-gradient(180deg, oklch(0.556 0 0 / 0.04) 0%, oklch(0.556 0 0 / 0.08) 50%, oklch(0.556 0 0 / 0.04) 100%)",
      }}
    >
      <StaggerContainer
        className={cn(
          "max-w-6xl mx-auto px-4",
          "flex flex-wrap items-center justify-center gap-8 md:gap-12"
        )}
      >
        {STATS.map((stat, i) => (
          <StatCard key={stat.label} stat={stat} isLast={i === STATS.length - 1} />
        ))}
      </StaggerContainer>
    </section>
  );
}
