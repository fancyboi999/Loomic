"use client";

import { MessageSquare, Sparkles, Paintbrush } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/landing/section-header";
import { StaggerContainer, FadeUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Pulse animation for icon circle
// ---------------------------------------------------------------------------

const howItWorksStyles = `
  @keyframes iconPulse {
    0% { box-shadow: 0 0 0 0 oklch(0.90 0.17 115 / 0.3); }
    70% { box-shadow: 0 0 0 10px oklch(0.90 0.17 115 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.90 0.17 115 / 0); }
  }
`;

// ---------------------------------------------------------------------------
// Step data
// ---------------------------------------------------------------------------

interface Step {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    icon: MessageSquare,
    title: "描述你的想法",
    description:
      "用自然语言描述你想要的设计，或上传参考图片。AI 会理解你的真实意图。",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "AI 智能创作",
    description:
      "Loomic 分析你的需求，生成多个专业设计方案。从配色到排版，每个细节都经过精心考量。",
  },
  {
    number: "03",
    icon: Paintbrush,
    title: "精细调整",
    description:
      "在画布上自由编辑任何元素。满意后一键导出，支持多种格式。",
  },
];

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------

interface StepCardProps {
  step: Step;
  isLast: boolean;
}

function StepCard({ step, isLast }: StepCardProps) {
  const Icon = step.icon;

  return (
    <FadeUp
      className={cn(
        "relative p-8 rounded-2xl bg-background border border-border/60",
        "hover:border-accent/40 hover:-translate-y-1",
        "transition-all duration-300 group overflow-hidden"
      )}
    >
      {/* Gradient top border — 2px accent line fading out */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, oklch(0.90 0.17 115 / 0.6) 50%, transparent 100%)",
        }}
      />

      {/* Large watermark number — gradient text */}
      <span
        className="absolute top-4 right-5 text-6xl font-bold leading-none select-none pointer-events-none bg-gradient-to-b from-accent/20 to-transparent bg-clip-text"
        style={{ WebkitTextFillColor: "transparent" }}
      >
        {step.number}
      </span>

      {/* Icon circle — pulse animation on scroll */}
      <div
        className={cn(
          "size-12 rounded-full flex items-center justify-center mb-6",
          "bg-accent/10 text-accent",
          "transition-colors duration-200 group-hover:bg-accent/20"
        )}
        style={{
          animation: "iconPulse 2s ease-out 0.6s 1",
        }}
      >
        <Icon className="size-5" />
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>

      {/* Description */}
      <p className="text-muted-foreground text-sm leading-relaxed">
        {step.description}
      </p>

      {/* Desktop connector arrow (hidden on last card) */}
      {!isLast && (
        <div className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 items-center justify-center">
          <div
            className="size-12 rounded-full bg-background border border-border/60 flex items-center justify-center shadow-sm"
            aria-hidden
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="text-muted-foreground/50"
              fill="currentColor"
            >
              <path d="M7.293 1.293a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L10.586 8H1a1 1 0 1 1 0-2h9.586L7.293 2.707a1 1 0 0 1 0-1.414z" />
            </svg>
          </div>
        </div>
      )}
    </FadeUp>
  );
}

// ---------------------------------------------------------------------------
// HowItWorks
// ---------------------------------------------------------------------------

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-muted/30">
      <style>{howItWorksStyles}</style>
      <div className="max-w-5xl mx-auto px-4">
        {/* Section header */}
        <div className="mb-16 md:mb-20">
          <SectionHeader
            title="三步开始创作"
            subtitle="从想法到作品，简单到超乎想象"
          />
        </div>

        {/* Steps grid */}
        <StaggerContainer
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative"
        >
          {STEPS.map((step, index) => (
            <StepCard
              key={step.number}
              step={step}
              isLast={index === STEPS.length - 1}
            />
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
