"use client";

import { Check, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/landing/section-header";
import { StaggerContainer, scaleUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Pricing plan data
// Keyframe `landing-border-shift` is defined in globals.css
// ---------------------------------------------------------------------------

interface PricingPlan {
  name: string;
  badge?: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

const PLANS: PricingPlan[] = [
  {
    name: "免费版",
    price: "¥0",
    period: "永久免费",
    features: [
      "每月 10 次 AI 生成",
      "基础设计模板",
      "单项目空间",
      "社区支持",
    ],
    cta: "免费开始",
    highlighted: false,
  },
  {
    name: "专业版",
    badge: "最受欢迎",
    price: "¥99",
    period: "每月",
    features: [
      "无限 AI 生成",
      "全部 AI 模型",
      "无限项目空间",
      "品牌工具包",
      "优先支持",
      "高清导出",
    ],
    cta: "升级 Pro",
    highlighted: true,
  },
  {
    name: "团队版",
    price: "¥299",
    period: "每月 / 每人",
    features: [
      "Pro 全部功能",
      "团队协作空间",
      "共享资源库",
      "管理控制台",
      "API 接入",
      "专属客户经理",
    ],
    cta: "联系我们",
    highlighted: false,
  },
];

// ---------------------------------------------------------------------------
// PricingCard
// ---------------------------------------------------------------------------

function PricingCard({ plan }: { plan: PricingPlan }) {
  return (
    <motion.div
      variants={scaleUp}
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 md:p-8 bg-card",
        "hover:-translate-y-1 transition-transform duration-300",
        plan.highlighted
          ? "border-2 md:-translate-y-2 shadow-xl hover:md:-translate-y-3"
          : "border-border",
      )}
      style={
        plan.highlighted
          ? {
              animation: "landing-border-shift 4s ease-in-out infinite",
              boxShadow: "0 0 32px 0 oklch(0.90 0.17 115 / 0.12)",
            }
          : {}
      }
    >
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: "oklch(0.90 0.17 115)",
              color: "oklch(0.2 0 0)",
            }}
          >
            <Sparkles className="size-3" />
            {plan.badge}
          </span>
        </div>
      )}

      {/* Plan name */}
      <p className="text-lg font-semibold text-foreground">{plan.name}</p>

      {/* Price */}
      <div className="mt-4">
        <span className="text-4xl font-bold text-foreground tabular-nums">
          {plan.price}
        </span>
        <span className="ml-2 text-sm text-muted-foreground">
          {plan.period}
        </span>
      </div>

      {/* Features */}
      <ul className="space-y-3 mt-6 flex-1">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-3">
            <div
              className="size-5 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "oklch(0.90 0.17 115 / 0.15)",
              }}
            >
              <Check
                className="size-3 shrink-0"
                style={{ color: "oklch(0.65 0.17 115)" }}
              />
            </div>
            <span className="text-sm text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-8">
        {plan.highlighted ? (
          <button
            className={cn(
              "w-full rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
              "hover:scale-[1.02] active:scale-[0.98]",
            )}
            style={{
              background: "oklch(0.90 0.17 115)",
              color: "oklch(0.2 0 0)",
            }}
          >
            {plan.cta}
          </button>
        ) : (
          <Button variant="outline" className="w-full">
            {plan.cta}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PricingPreview
// ---------------------------------------------------------------------------

export function PricingPreview() {
  return (
    <section id="pricing" className="py-24 md:py-32 relative overflow-hidden">
      {/* Subtle dots grid background */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, oklch(0.556 0 0) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4">
        <div className="mb-14 md:mb-20">
          <SectionHeader
            title="选择你的计划"
            subtitle="灵活定价，按需选择"
          />
        </div>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} plan={plan} />
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
