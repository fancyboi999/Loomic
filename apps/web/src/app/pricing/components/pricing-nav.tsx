"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LoomicLogo } from "@/components/icons/loomic-logo";
import { buttonVariants } from "@/components/ui/button";

export function PricingNav() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg"
    >
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <LoomicLogo className="size-7 text-foreground" />
          <span className="text-base font-semibold tracking-tight">
            Loomic
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            登录
          </Link>
          <Link
            href="/register"
            className={buttonVariants({ size: "sm" })}
          >
            免费开始
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}
