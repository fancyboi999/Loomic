"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, ChevronDown, ArrowRight } from "lucide-react";
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
// Animated cursor inside mockup canvas
// ---------------------------------------------------------------------------

function MockupCursor() {
  return (
    <motion.div
      className="absolute z-10 pointer-events-none will-change-transform"
      animate={{
        x: [40, 120, 180, 60, 40],
        y: [30, 80, 40, 120, 30],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Cursor arrow */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="drop-shadow-md"
        aria-hidden="true"
      >
        <path
          d="M1 1L6.5 14L8.5 8.5L14 6.5L1 1Z"
          fill="oklch(0.90 0.17 115)"
          stroke="oklch(0.90 0.17 115 / 0.6)"
          strokeWidth="0.5"
        />
      </svg>
      {/* Cursor label */}
      <div
        className="mt-0.5 ml-3 px-1.5 py-0.5 rounded text-[8px] font-medium whitespace-nowrap"
        style={{
          background: "oklch(0.90 0.17 115)",
          color: "oklch(0.25 0.04 115)",
        }}
      >
        AI
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// HeroMockup -- canvas interface preview
// Uses next/image with unoptimized for CLS prevention via explicit dimensions
// ---------------------------------------------------------------------------

function HeroMockup() {
  return (
    <motion.div
      variants={scaleUp}
      initial="hidden"
      animate="visible"
      transition={{ delay: 1.2 }}
      className="relative w-full max-w-5xl mx-auto mt-16 md:mt-24 will-change-transform"
      style={{ animation: "landing-hero-float 6s ease-in-out infinite" }}
    >
      {/* Glow behind mockup */}
      <div
        className="absolute inset-0 -z-10 rounded-2xl blur-3xl opacity-20 dark:opacity-30"
        style={{
          background:
            "radial-gradient(ellipse at 50% 80%, oklch(0.90 0.17 115 / 0.4) 0%, transparent 70%)",
        }}
      />

      <div className="w-full rounded-2xl border border-border bg-card overflow-hidden shadow-2xl aspect-video ring-1 ring-white/10">
        {/* Window chrome */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-yellow-400/80" />
            <span className="size-3 rounded-full bg-green-400/80" />
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Loomic Canvas
          </span>
          <div className="w-14" />
        </div>

        {/* Canvas area -- hero image is LCP candidate, loaded eagerly */}
        <div className="relative w-full h-full">
          <MockupCursor />
          <Image
            src="/images/showcase/showcase-12.jpg"
            alt="Loomic Canvas AI creative workspace"
            width={1200}
            height={675}
            priority
            unoptimized
            className="w-full h-full object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1024px"
          />
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ScrollIndicator -- smooth sine wave
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
        animate={{ y: [0, 8, 0] }}
        transition={{
          repeat: Infinity,
          duration: 2.4,
          ease: [0.37, 0, 0.63, 1],
        }}
      >
        <ChevronDown className="size-5 text-muted-foreground/50" />
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedSubtitle -- separate to isolate motion state
// ---------------------------------------------------------------------------

function AnimatedSubtitle({ show }: { show: boolean }) {
  return (
    <motion.p
      variants={blurIn}
      initial="hidden"
      animate={show ? "visible" : "hidden"}
      className="mt-4 text-sm md:text-base text-muted-foreground font-light tracking-[0.2em] uppercase"
    >
      Where Ideas Become Reality
    </motion.p>
  );
}

// ---------------------------------------------------------------------------
// HeroSection
// ---------------------------------------------------------------------------

export function HeroSection() {
  const { isComplete } = useTypewriter({
    text: "让创意，自由生长",
    speed: 60,
    delay: 200,
  });
  const [showSub, setShowSub] = useState(false);

  // Compute typewriter total duration: delay + text.length * speed
  // 200 + 7 * 60 = 620ms -> subtitle at ~1020ms
  const typewriterEnd = 200 + 7 * 60;
  const subtitleDelay = typewriterEnd + 400;
  const descDelay = (subtitleDelay + 200) / 1000;
  const ctaDelay = (subtitleDelay + 400) / 1000;

  useEffect(() => {
    if (isComplete) {
      const t = setTimeout(() => setShowSub(true), 400);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 md:pt-32 pb-24 overflow-hidden">
      {/* Animated gradient background -- GPU-composited via translate3d */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="landing-hero-glow-1 absolute -top-1/4 right-0 w-[80vw] h-[80vw] rounded-full opacity-60 will-change-transform"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.90 0.17 115 / 0.08) 0%, transparent 70%)",
            animation: "landing-gradient-drift-1 18s ease-in-out infinite alternate",
          }}
        />
        <div
          className="landing-hero-glow-2 absolute bottom-0 -left-1/4 w-[60vw] h-[60vw] rounded-full opacity-50 will-change-transform"
          style={{
            background:
              "radial-gradient(ellipse at center, oklch(0.556 0 0 / 0.05) 0%, transparent 70%)",
            animation: "landing-gradient-drift-2 22s ease-in-out infinite alternate",
          }}
        />
        {/* Noise/grain texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            backgroundSize: "128px 128px",
          }}
        />
        {/* Radial vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, oklch(0 0 0 / 0.03) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="flex flex-col items-center text-center px-4 max-w-4xl mx-auto w-full">
        {/* Badge */}
        <HeroBadge />

        {/* Headline -- gradient text + tighter tracking */}
        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
          className="mt-6 text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent"
        >
          <TypewriterText text="让创意，自由生长" speed={60} delay={200} />
        </motion.h1>

        {/* English subtitle -- editorial style */}
        <AnimatedSubtitle show={showSub} />

        {/* Description */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: descDelay }}
          className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed"
        >
          从灵感到作品，Loomic 是你的 AI 设计伙伴。智能理解你的创意意图，生成专业级设计，让每一个想法都能成为现实。
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: ctaDelay }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/login"
            className={cn(
              "landing-cta-shimmer inline-flex items-center px-8 py-3 rounded-full text-base font-medium",
              "text-foreground",
              "transition-all duration-200 hover:scale-105 active:scale-95",
              "hover:shadow-[0_0_24px_4px_oklch(0.90_0.17_115_/_0.35)]",
            )}
            style={{
              background:
                "linear-gradient(135deg, oklch(0.90 0.17 115) 0%, oklch(0.82 0.17 115) 100%)",
            }}
          >
            开始创作
          </Link>
          <a
            href="#showcase"
            onClick={(e) => {
              e.preventDefault();
              document
                .querySelector("#showcase")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group inline-flex items-center gap-2 px-8 py-3 rounded-full text-base font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
          >
            查看案例
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
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
