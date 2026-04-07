"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/landing/motion";

// ---------------------------------------------------------------------------
// Background orbs + floating particles
// All keyframes (landing-orb-drift-*, landing-float-up, landing-cta-pulse-ring)
// are defined in globals.css for better caching and no runtime injection.
// ---------------------------------------------------------------------------

const PARTICLES = [
  { left: "10%", bottom: "15%", delay: "0s", duration: "6s", size: "3px" },
  { left: "25%", bottom: "8%", delay: "1.2s", duration: "7s", size: "2px" },
  { left: "40%", bottom: "20%", delay: "2.5s", duration: "5.5s", size: "2.5px" },
  { left: "55%", bottom: "12%", delay: "0.8s", duration: "6.5s", size: "3px" },
  { left: "70%", bottom: "18%", delay: "3s", duration: "7.5s", size: "2px" },
  { left: "82%", bottom: "10%", delay: "1.8s", duration: "6s", size: "2.5px" },
  { left: "15%", bottom: "25%", delay: "4s", duration: "5s", size: "2px" },
  { left: "90%", bottom: "22%", delay: "2s", duration: "7s", size: "3px" },
] as const;

function BackgroundOrbs() {
  return (
    <>
      {/* Orb 1 -- top left (GPU-composited via translate3d in keyframes) */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl will-change-transform"
        style={{
          background: "oklch(0.90 0.17 115 / 0.20)",
          animation: "landing-orb-drift-1 14s ease-in-out infinite",
        }}
      />
      {/* Orb 2 -- bottom right */}
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-3xl will-change-transform"
        style={{
          background: "oklch(0.90 0.17 115 / 0.15)",
          animation: "landing-orb-drift-2 18s ease-in-out infinite",
        }}
      />
      {/* Orb 3 -- center */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl will-change-transform"
        style={{
          background: "oklch(0.90 0.17 115 / 0.08)",
          animation: "landing-orb-drift-3 22s ease-in-out infinite",
        }}
      />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            background: "oklch(0.90 0.17 115 / 0.5)",
            animation: `landing-float-up ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// FinalCTA
// ---------------------------------------------------------------------------

export function FinalCTA() {
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-4">
        <div
          className="relative overflow-hidden rounded-3xl px-8 py-20 md:py-28 flex flex-col items-center text-center"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, oklch(0.18 0.02 115) 0%, oklch(0.13 0 0) 60%, oklch(0.10 0 0) 100%)",
          }}
        >
          {/* Background orbs + particles */}
          <BackgroundOrbs />

          {/* Headline */}
          <FadeUp>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight max-w-3xl text-white">
              准备好让 AI 改变你的设计流程了吗？
            </h2>
          </FadeUp>

          {/* Subtitle */}
          <FadeUp>
            <p
              className="mt-4 text-lg max-w-xl"
              style={{ color: "oklch(1 0 0 / 0.55)" }}
            >
              加入 10,000+ 创作者，开启你的 AI 设计之旅
            </p>
          </FadeUp>

          {/* CTA button with pulse ring -- hover via CSS instead of imperative JS */}
          <FadeUp>
            <div className="relative mt-10 inline-flex items-center justify-center">
              {/* Pulsing ring */}
              <div
                className="absolute top-1/2 left-1/2 w-full h-full rounded-full pointer-events-none"
                style={{
                  border: "2px solid oklch(0.90 0.17 115 / 0.3)",
                  animation: "landing-cta-pulse-ring 2.5s ease-out infinite",
                }}
                aria-hidden="true"
              />
              <Link
                href="/register"
                className="relative inline-flex items-center px-12 py-4 rounded-full text-lg font-medium transition-all duration-200 hover:scale-105 active:scale-95 hover:shadow-[0_0_40px_12px_oklch(0.90_0.17_115_/_0.35)]"
                style={{
                  background: "oklch(0.90 0.17 115)",
                  color: "oklch(0.18 0 0)",
                  boxShadow: "0 0 24px 4px oklch(0.90 0.17 115 / 0.2)",
                }}
              >
                免费开始创作
              </Link>
            </div>
          </FadeUp>

          {/* Fine print */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-4 text-sm"
            style={{ color: "oklch(1 0 0 / 0.35)" }}
          >
            无需信用卡 · 永久免费版可用
          </motion.p>
        </div>
      </div>
    </section>
  );
}
