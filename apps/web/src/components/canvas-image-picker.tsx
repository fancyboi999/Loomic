"use client";

import { useEffect, useRef } from "react";

export type CanvasImageItem = {
  kind: "canvas-image";
  id: string;
  name: string;
  thumbnailUrl: string;
  assetId: string;
  url: string;
  mimeType: string;
};

export type BrandKitMentionItem = {
  kind: "brand-kit-asset";
  id: string;
  label: string;
  assetType: "color" | "font" | "logo" | "image";
  textContent?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type ImageModelMentionItem = {
  kind: "image-model";
  id: string;
  label: string;
  description?: string;
  iconUrl?: string;
};

export type MessageMentionPickerItem =
  | CanvasImageItem
  | BrandKitMentionItem
  | ImageModelMentionItem;

type MessageMentionPickerProps = {
  items: MessageMentionPickerItem[];
  query?: string;
  onSelect: (item: MessageMentionPickerItem) => void;
  onClose: () => void;
};

function itemLabel(item: MessageMentionPickerItem): string {
  return item.kind === "canvas-image" ? item.name : item.label;
}

function itemKeywords(item: MessageMentionPickerItem): string[] {
  if (item.kind === "canvas-image") return [item.name];
  if (item.kind === "image-model") return [item.label, item.description ?? ""];
  return [item.label, item.assetType, item.textContent ?? ""];
}

function groupTitle(kind: MessageMentionPickerItem["kind"]): string {
  if (kind === "canvas-image") return "This Project";
  if (kind === "brand-kit-asset") return "Brand Kit";
  return "Model";
}

export function MessageMentionPicker({
  items,
  query,
  onSelect,
  onClose,
}: MessageMentionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredItems = query
    ? items.filter((item) =>
        itemKeywords(item).some((keyword) =>
          keyword.toLowerCase().includes(query.toLowerCase()),
        ),
      )
    : items;

  const groupedItems = filteredItems.reduce<
    Record<MessageMentionPickerItem["kind"], MessageMentionPickerItem[]>
  >(
    (acc, item) => {
      acc[item.kind].push(item);
      return acc;
    },
    {
      "canvas-image": [],
      "brand-kit-asset": [],
      "image-model": [],
    },
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (filteredItems.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-2 mb-2 w-56 rounded-xl border border-border bg-popover p-3 shadow-lg"
      >
        <p className="text-xs text-muted-foreground">
          {items.length === 0 ? "No items available to mention" : `No match for "${query}"`}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-2 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
    >
      <div className="p-2">
        {(
          [
            "canvas-image",
            "brand-kit-asset",
            "image-model",
          ] as const
        ).map((kind) => {
          const sectionItems = groupedItems[kind];
          if (!sectionItems.length) return null;
          return (
            <div key={kind} className="mb-2 last:mb-0">
              <div className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
                {groupTitle(kind)}
              </div>
              {sectionItems.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <PickerLeadingVisual item={item} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">
                      {itemLabel(item)}
                    </div>
                    {item.kind === "brand-kit-asset" && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {item.assetType}
                        {item.textContent ? ` · ${item.textContent}` : ""}
                      </div>
                    )}
                    {item.kind === "image-model" && item.description && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {item.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PickerLeadingVisual({ item }: { item: MessageMentionPickerItem }) {
  if (item.kind === "canvas-image") {
    return (
      <img
        src={item.thumbnailUrl}
        alt={item.name}
        className="h-8 w-8 shrink-0 rounded border border-border object-cover"
      />
    );
  }

  if (item.kind === "brand-kit-asset" && item.thumbnailUrl) {
    return (
      <img
        src={item.thumbnailUrl}
        alt={item.label}
        className="h-8 w-8 shrink-0 rounded border border-border object-cover"
      />
    );
  }

  if (item.kind === "image-model" && item.iconUrl) {
    return (
      <img
        src={item.iconUrl}
        alt={item.label}
        className="h-8 w-8 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-[10px] font-medium uppercase text-muted-foreground">
      {item.kind === "brand-kit-asset"
        ? item.assetType.slice(0, 2)
        : "AI"}
    </div>
  );
}
