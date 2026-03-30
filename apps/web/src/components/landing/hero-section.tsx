"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeUp, blurIn, scaleUp } from "@/components/landing/motion";
import { TypewriterText, useTypewriter } from "@/components/landing/typewriter";

// ---------------------------------------------------------------------------
// HeroBadge
// ---------------------------------------------------------------------------

function HeroBadge() {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm backdrop-blur"
    >
      <Sparkles className="size-3.5 text-accent" />
      <span className="text-muted-foreground">AI-Powered Creative Design</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HeroMockup — canvas interface preview
// ---------------------------------------------------------------------------

function HeroMockup() {
  return (
    <motion.div
      variants={scaleUp}
      initial="hidden"
      animate="visible"
      transition={{ delay: 1.8 }}
      className="relative w-full max-w-5xl mx-auto mt-16 md:mt-24"
      style={{ animation: "heroFloat 6s ease-in-out infinite" }}
    >
      {/* Glow behind mockup */}
      <div
        className="absolute inset-0 -z-10 rounded-2xl blur-3xl opacity-20 dark:opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at 50% 80%, oklch(0.90 0.17 115 / 0.4) 0%, transparent 70%)",
        }}
      />

      <div className="w-full rounded-2xl border border-border bg-card overflow-hidden shadow-2xl aspect-video">
        {/* Window chrome */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-yellow-400/80" />
            <span className="size-3 rounded-full bg-green-400/80" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">Loomic Canvas</span>
          <div className="w-14" />
        </div>

        {/* Canvas area */}
        <div className="relative flex h-full">
          {/* Left sidebar */}
          <div className="w-12 border-r border-border bg-muted/20 flex flex-col items-center gap-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="size-6 rounded bg-muted/60" />
            ))}
          </div>

          {/* Main canvas */}
          <div className="flex-1 p-6 grid grid-cols-3 gap-4 content-start">
            {/* Card 1 — accent */}
            <div
              className="rounded-xl aspect-[4/3] col-span-2"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.90 0.17 115 / 0.25) 0%, oklch(0.90 0.17 115 / 0.08) 100%)",
                border: "1px solid oklch(0.90 0.17 115 / 0.3)",
              }}
            >
              <div className="p-4 flex flex-col gap-2 h-full">
                <div className="h-2 w-16 rounded-full bg-muted/60" />
                <div className="h-1.5 w-24 rounded-full bg-muted/40" />
                <div className="mt-auto flex gap-2">
                  <div className="h-1 w-8 rounded-full bg-muted/50" />
                  <div className="h-1 w-12 rounded-full bg-muted/30" />
                </div>
              </div>
            </div>
            {/* Card 2 */}
            <div className="rounded-xl aspect-square bg-muted/40 border border-border">
              <div className="p-3 flex flex-col gap-1.5">
                <div className="h-8 w-8 rounded-full bg-muted/70 mx-auto mt-2" />
                <div className="h-1.5 w-full rounded-full bg-muted/50 mt-2" />
                <div className="h-1.5 w-3/4 rounded-full bg-muted/30" />
              </div>
            </div>
            {/* Card 3 */}
            <div className="rounded-xl aspect-[4/3] bg-muted/30 border border-border flex items-center justify-center">
              <div className="size-10 rounded-lg bg-muted/60 flex items-center justify-center">
                <div className="size-4 rounded bg-muted/80" />
              </div>
            </div>
            {/* Card 4 */}
            <div
              className="rounded-xl aspect-[4/3] col-span-2"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.205 0 0 / 0.04) 0%, oklch(0.556 0 0 / 0.04) 100%)",
                border: "1px solid oklch(0.922 0 0 / 0.6)",
              }}
            >
              <div className="p-4 flex gap-3 h-full items-start">
                <div className="size-6 rounded-full bg-muted/50 shrink-0" />
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="h-1.5 w-full rounded-full bg-muted/50" />
                  <div className="h-1.5 w-5/6 rounded-full bg-muted/40" />
                  <div className="h-1.5 w-2/3 rounded-full bg-muted/30" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: AI chat bubble */}
          <div className="w-48 border-l border-border bg-muted/10 flex flex-col gap-3 p-3 shrink-0">
            <div className="text-[10px] font-medium text-muted-foreground px-1">AI 助手</div>
            <div className="rounded-xl bg-muted/40 p-2.5 border border-border">
              <div className="flex flex-col gap-1.5">
                <div className="h-1 w-full rounded-full bg-muted/60" />
                <div className="h-1 w-4/5 rounded-full bg-muted/50" />
                <div className="h-1 w-2/3 rounded-full bg-muted/40" />
              </div>
            </div>
            <div
              className="rounded-xl p-2.5"
              style={{
                background: "oklch(0.90 0.17 115 / 0.12)",
                border: "1px solid oklch(0.90 0.17 115 / 0.25)",
              }}
            >
              <div className="flex flex-col gap-1.5">
                <div className="h-1 w-full rounded-full" style={{ background: "oklch(0.90 0.17 115 / 0.4)" }} />
                <div className="h-1 w-4/5 rounded-full" style={{ background: "oklch(0.90 0.17 115 / 0.3)" }} />
              </div>
            </div>
            {/* Input bar */}
            <div className="mt-auto rounded-lg border border-border bg-background/60 px-2.5 py-2 text-[10px] text-muted-foreground/50">
              发送消息...
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ScrollIndicator
// ---------------------------------------------------------------------------

function ScrollIndicator() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 200], [1, 0]);

  return (
    <motion.div
      style={{ opacity }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
    >
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
      >
        <ChevronDown className="size-5 text-muted-foreground/50" />
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HeroSection
// ---------------------------------------------------------------------------

export function HeroSection() {
  const { isComplete } = useTypewriter({
    text: "让创意，自由生长",
    speed: 80,
    delay: 300,
  });
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    if (isComplete) {
      const t = setTimeout(() => setShowSub(true), 200);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 md:pt-32 pb-24 overflow-hidden">
      {/* Animated gradient background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-1/4 right-0 w-[80vw] h-[80vw] rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.90 0.17 115 / 0.08) 0%, transparent 70%)",
            animation: "gradientDrift1 18s ease-in-out infinite alternate",
          }}
        />
        <div
          className="absolute bottom-0 -left-1/4 w-[60vw] h-[60vw] rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.556 0 0 / 0.05) 0%, transparent 70%)",
            animation: "gradientDrift2 22s ease-in-out infinite alternate",
          }}
        />
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes gradientDrift1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-6%, 8%) scale(1.1); }
        }
        @keyframes gradientDrift2 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(5%, -6%) scale(1.08); }
        }
        @keyframes heroFloat {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        .dark .hero-glow-1 { opacity: 0.15; }
        .dark .hero-glow-2 { opacity: 0.12; }
      `}</style>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-4 max-w-4xl mx-auto w-full">
        {/* Badge */}
        <HeroBadge />

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.15 }}
          className="mt-6 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground"
        >
          <TypewriterText text="让创意，自由生长" speed={80} delay={300} />
        </motion.h1>

        {/* English subtitle */}
        <AnimatedSubtitle show={showSub} />

        {/* Description */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 2.8 }}
          className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
        >
          从灵感到作品，Loomic 是你的 AI 设计伙伴。智能理解你的创意意图，生成专业级设计，让每一个想法都能成为现实。
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 3.0 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/login"
            className={cn(
              "inline-flex items-center px-8 py-3 rounded-full text-base font-medium transition-all duration-200",
              "text-foreground",
              "hover:scale-105 active:scale-95",
            )}
            style={{
              background:
                "linear-gradient(135deg, oklch(0.90 0.17 115) 0%, oklch(0.82 0.17 115) 100%)",
              boxShadow: "0 0 0 0 oklch(0.90 0.17 115 / 0)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 24px 4px oklch(0.90 0.17 115 / 0.35)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 0 0 0 oklch(0.90 0.17 115 / 0)";
            }}
          >
            开始创作
          </Link>
          <a
            href="#showcase"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector("#showcase")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="inline-flex items-center px-8 py-3 rounded-full text-base font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
          >
            查看案例
          </a>
        </motion.div>

        {/* Mockup */}
        <HeroMockup />
      </div>

      {/* Scroll indicator */}
      <ScrollIndicator />
    </section>
  );
}

// ---------------------------------------------------------------------------
// AnimatedSubtitle — separate to isolate motion state
// ---------------------------------------------------------------------------

function AnimatedSubtitle({ show }: { show: boolean }) {
  return (
    <motion.p
      variants={blurIn}
      initial="hidden"
      animate={show ? "visible" : "hidden"}
      className="mt-4 text-xl md:text-2xl text-muted-foreground font-light tracking-wide"
    >
      Where Ideas Become Reality
    </motion.p>
  );
}
