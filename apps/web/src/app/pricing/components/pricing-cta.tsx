"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { fadeInUp } from "./pricing-data";

export function PricingCTA() {
  return (
    <section className="px-6 py-20">
      {/* CTA Card */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="mx-auto max-w-4xl rounded-3xl bg-foreground px-8 py-16 text-center"
      >
        <h2 className="text-3xl font-bold text-primary-foreground">
          准备好开始创作了吗？
        </h2>
        <p className="mt-3 text-base text-primary-foreground/60">
          免费开始，无需信用卡。随时升级解锁更多功能。
        </p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/register"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-accent text-accent-foreground hover:bg-accent/90",
              )}
            >
              免费开始
            </Link>
          </motion.div>

          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/pricing#features"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-white/30 bg-transparent text-white hover:bg-white/10",
              )}
            >
              查看所有功能
            </Link>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer */}
      <footer className="mt-16 mb-8 text-center text-sm text-muted-foreground">
        <p>&copy; 2026 Loomic. All rights reserved.</p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            隐私政策
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            服务条款
          </Link>
          <span className="text-border">|</span>
          <Link
            href="/contact"
            className="transition-colors hover:text-foreground"
          >
            联系我们
          </Link>
        </div>
      </footer>
    </section>
  );
}
