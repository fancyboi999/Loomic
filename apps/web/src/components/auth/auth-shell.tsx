"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { LoomicLogoInverted } from "../icons/loomic-logo";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
} as any;

interface AuthShellProps {
  title: string;
  description: string;
  features: string[];
  children: ReactNode;
}

export function AuthShell({
  title,
  description,
  features,
  children,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden overflow-hidden bg-black px-16 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute -left-1/4 -top-1/4 h-[80%] w-[80%] rounded-full bg-white/[0.03] blur-[100px]" />

        <motion.div initial="hidden" animate="visible" className="relative z-10">
          <motion.div
            variants={fadeUp}
            custom={0}
            className="mb-4 flex items-center gap-4"
          >
            <LoomicLogoInverted className="size-14" />
            <h1 className="text-4xl font-bold tracking-tight">Loomic</h1>
          </motion.div>

          <motion.p variants={fadeUp} custom={1} className="mb-3 text-3xl font-semibold tracking-tight">
            {title}
          </motion.p>

          <motion.p variants={fadeUp} custom={2} className="mb-10 max-w-md text-lg text-neutral-400">
            {description}
          </motion.p>

          <ul className="space-y-4 text-sm text-neutral-300">
            {features.map((text, index) => (
              <motion.li
                key={text}
                variants={fadeUp}
                custom={index + 3}
                className="flex items-start gap-3"
              >
                <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                {text}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-sm"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
