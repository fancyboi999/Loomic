"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { faqItems, fadeInUp } from "./pricing-data";

export function PricingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      custom={0}
      className="px-6 py-20"
    >
      {/* Header */}
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <h2 className="text-foreground text-2xl font-bold md:text-3xl">
          常见问题
        </h2>
      </div>

      {/* Accordion */}
      <div className="bg-card mx-auto max-w-3xl overflow-hidden rounded-xl border">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          const isLast = index === faqItems.length - 1;

          return (
            <div
              key={item.question}
              className={isLast ? "" : "border-border border-b"}
            >
              {/* Question row */}
              <button
                type="button"
                onClick={() => toggle(index)}
                className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-6 py-5 text-left transition-colors"
              >
                <span className="text-foreground text-base font-medium pr-4">
                  {item.question}
                </span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-muted-foreground shrink-0"
                >
                  <ChevronDown className="size-5" />
                </motion.span>
              </button>

              {/* Answer */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="text-muted-foreground px-6 pb-5 text-sm leading-relaxed">
                      {item.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
