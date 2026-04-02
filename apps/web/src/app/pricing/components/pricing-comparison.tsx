"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { featureCategories, pricingTiers, fadeInUp } from "./pricing-data";

const tierIds = pricingTiers.map((t) => t.id);
const proIndex = tierIds.indexOf("pro");

const INITIAL_CATEGORIES = 2;

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center text-foreground">
        <Check className="size-4" />
      </span>
    );
  }
  if (value === false) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{value}</span>;
}

export function PricingComparison() {
  const [expanded, setExpanded] = useState(false);

  const visibleCategories = expanded
    ? featureCategories
    : featureCategories.slice(0, INITIAL_CATEGORIES);

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
      <div className="mx-auto mb-12 max-w-6xl text-center">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">
          功能对比
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          查看所有套餐的详细功能差异
        </p>
      </div>

      {/* Single table with CSS transition for expand */}
      <div className="mx-auto max-w-6xl overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky top-0 z-10 bg-background px-4 py-4 text-left text-sm font-medium" />
              {pricingTiers.map((tier, i) => (
                <th
                  key={tier.id}
                  className={`sticky top-0 z-10 bg-background px-4 py-4 text-center text-sm font-medium ${
                    i === proIndex ? "bg-accent/5" : ""
                  }`}
                >
                  <span>{tier.name}</span>
                  {tier.badge && i === proIndex && (
                    <span className="mt-1 block text-[10px] font-semibold leading-tight text-accent-foreground">
                      {tier.badge}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {visibleCategories.map((category) => (
              <CategoryRows key={category.name} category={category} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Toggle button */}
      {featureCategories.length > INITIAL_CATEGORIES && (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "收起 ↑" : "展开全部功能 ↓"}
          </Button>
        </div>
      )}
    </motion.section>
  );
}

function CategoryRows({
  category,
}: {
  category: (typeof featureCategories)[number];
}) {
  return (
    <>
      <tr className="bg-muted">
        <td
          colSpan={tierIds.length + 1}
          className="px-4 py-2.5 text-sm font-semibold"
        >
          {category.name}
        </td>
      </tr>

      {category.features.map((feature) => (
        <tr
          key={feature.name}
          className="border-b border-border transition-colors hover:bg-muted/50"
        >
          <td className="px-4 py-3 text-left text-sm">{feature.name}</td>
          {tierIds.map((tierId, i) => (
            <td
              key={tierId}
              className={`px-4 py-3 text-center text-sm ${
                i === proIndex ? "bg-accent/5" : ""
              }`}
            >
              <CellValue value={feature.tiers[tierId] ?? false} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
