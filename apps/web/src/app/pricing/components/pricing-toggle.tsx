"use client";

import { motion } from "framer-motion";
import type { BillingPeriod } from "./pricing-data";

interface PricingToggleProps {
  value: BillingPeriod;
  onChange: (v: BillingPeriod) => void;
}

const options: { key: BillingPeriod; label: string }[] = [
  { key: "monthly", label: "月付" },
  { key: "yearly", label: "年付" },
];

export function PricingToggle({ value, onChange }: PricingToggleProps) {
  return (
    <div className="bg-muted inline-flex items-center gap-1 rounded-full p-1">
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className="relative z-0 flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {value === key && (
            <motion.span
              layoutId="pricing-toggle-bg"
              className="bg-card shadow-card absolute inset-0 rounded-full"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span
            className={`relative z-10 transition-colors ${
              value === key ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          {key === "yearly" && (
            <span className="bg-accent text-accent-foreground relative z-10 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              省 25%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
