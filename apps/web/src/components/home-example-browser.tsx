"use client";

import { useState } from "react";

import type {
  HomeExampleCard,
  HomeExampleCategory,
  HomeExampleSelection,
} from "@/lib/home-example-seeds";
import { cn } from "@/lib/utils";

type HomeExampleBrowserProps = {
  categories: HomeExampleCategory[];
  selectedExample?: HomeExampleSelection | null;
  onExampleSelect: (selection: HomeExampleSelection) => void;
};

type ExampleChipProps = {
  label: string;
  active: boolean;
  accent?: "special" | undefined;
  disabled: boolean;
  onClick: () => void;
};

function ExampleChip({
  label,
  active,
  accent,
  disabled,
  onClick,
}: ExampleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border-[0.5px] px-3 text-xs transition-all",
        accent === "special"
          ? "border-[#F37A12] bg-[#FFFBE3] text-[#F37A12] hover:bg-[#FFF6C2]"
          : active
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && accent !== "special" && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function ExamplePreviewCard({
  title,
  previewImages,
  selected,
  onClick,
}: {
  title: string;
  previewImages: string[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-pressed={selected}
      className={cn(
        "group aspect-[217/130] overflow-hidden rounded-xl px-4 pt-4 text-left transition-all duration-300",
        selected
          ? "bg-card shadow-md ring-1 ring-foreground/15"
          : "bg-card shadow-card hover:-translate-y-0.5 hover:bg-muted/70 hover:shadow-md",
      )}
    >
      <div className="flex h-20 w-full flex-col items-start gap-3 text-sm leading-5 text-foreground">
        {title}
      </div>
      <div className="relative -mt-3 h-full w-full">
        {previewImages.slice(0, 3).map((image, index) => {
          const positionClasses = [
            "left-[10%] top-0 w-[38%] -rotate-[15deg] group-hover:-translate-y-3",
            "left-[25%] -top-[10%] w-[44%] rotate-[9deg] group-hover:-translate-y-2",
            "left-[50%] top-[10%] w-[38%] rotate-[25deg] group-hover:-translate-y-2",
          ];

          return (
            <img
              key={image}
              src={image}
              alt=""
              loading="lazy"
              className={cn(
                "absolute aspect-[7/8] rounded-[4px] border-[0.5px] border-[#B0B0B0] object-cover transition-all duration-500 ease-out group-hover:shadow-lg",
                positionClasses[index] ?? positionClasses[0],
                selected && "shadow-lg",
              )}
            />
          );
        })}
      </div>
    </button>
  );
}

function toSelection(
  category: HomeExampleCategory,
  example: HomeExampleCard,
): HomeExampleSelection {
  return {
    categoryKey: category.key,
    categoryLabel: category.label,
    title: example.title,
    prompt: example.prompt,
    previewImages: example.previewImages,
    inputMentions: example.inputMentions,
  };
}

export function HomeExampleBrowser({
  categories,
  selectedExample,
  onExampleSelect,
}: HomeExampleBrowserProps) {
  const [internalSelection, setInternalSelection] =
    useState<HomeExampleSelection | null>(null);
  const currentSelection = selectedExample ?? internalSelection;
  const activeCategory =
    categories.find((category) => category.key === currentSelection?.categoryKey) ??
    null;
  const activeExamples = activeCategory?.examples ?? [];
  const hasExamples = activeExamples.length > 0;

  const applySelection = (selection: HomeExampleSelection) => {
    if (selectedExample === undefined) {
      setInternalSelection(selection);
    }
    onExampleSelect(selection);
  };

  const handleCategoryClick = (category: HomeExampleCategory) => {
    if (category.examples.length === 0) {
      return;
    }

    const firstExample = category.examples[0];
    if (!firstExample) {
      return;
    }
    applySelection(toSelection(category, firstExample));
  };

  const handleExampleClick = (
    category: HomeExampleCategory,
    example: HomeExampleCard,
  ) => {
    applySelection(toSelection(category, example));
  };

  return (
    <div className="mt-4 w-full">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((category) => {
          const active = category.key === currentSelection?.categoryKey;
          const disabled =
            category.accent !== "special" && category.examples.length === 0;

          return (
            <ExampleChip
              key={category.key}
              label={category.label}
              active={active}
              accent={category.accent}
              disabled={disabled}
              onClick={() => handleCategoryClick(category)}
            />
          );
        })}
      </div>

      {hasExamples ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeExamples.map((example) => (
            <ExamplePreviewCard
              key={`${activeCategory?.key ?? "active"}-${example.title}`}
              title={example.title}
              previewImages={example.previewImages}
              selected={currentSelection?.prompt === example.prompt}
              onClick={() =>
                activeCategory
                  ? handleExampleClick(activeCategory, example)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
