"use client";

import React from "react";

type MentionPillProps = {
  label: string;
  kind: "image-model" | "brand-kit-asset";
};

/**
 * Inline pill displaying a user mention (model or brand-kit asset).
 * Memoized because it receives stable string props and re-renders frequently
 * inside streaming message lists.
 */
export const MentionPill = React.memo(function MentionPill({
  label,
  kind,
}: MentionPillProps) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 mx-0.5 border-[0.5px] border-muted-foreground text-foreground align-middle">
      <span className="text-[10px] leading-none text-muted-foreground">
        {kind === "image-model" ? "Model" : "Brand"}
      </span>
      <span className="max-w-[120px] truncate text-[11px] leading-none text-foreground">
        {label}
      </span>
    </span>
  );
});
