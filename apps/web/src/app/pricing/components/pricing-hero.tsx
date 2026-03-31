"use client";

import { motion } from "framer-motion";
import { fadeInUp } from "./pricing-data";

export function PricingHero() {
  return (
    <section className="flex flex-col items-center px-6 pt-32 mb-14">
      <motion.span
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        custom={0}
        className="mb-4 inline-block rounded-full bg-accent/15 px-3.5 py-1 text-sm font-medium text-accent-foreground"
      >
        定价方案
      </motion.span>

      <motion.h1
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        custom={1}
        className="max-w-2xl text-center text-4xl font-bold tracking-tight md:text-5xl"
      >
        为每一位创作者而定价
      </motion.h1>

      <motion.p
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        custom={2}
        className="mt-4 max-w-lg text-center text-lg text-muted-foreground"
      >
        选择适合你的方案，从想法到作品只需几分钟
      </motion.p>
    </section>
  );
}
