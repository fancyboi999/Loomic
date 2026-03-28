"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ImageModelInfo } from "../lib/server-api";
import { fetchImageModels } from "../lib/server-api";
import { useImageModelPreference } from "../hooks/use-image-model-preference";

export function ImageModelPreferencePopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { preference, setMode, setModel } = useImageModelPreference();
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchImageModels()
      .then((data) => setModels(data.models))
      .catch(() => {});
  }, [open]);

  // Calculate position — auto-detect direction based on available space
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const popoverHeight = 400; // approximate max height
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < popoverHeight && rect.top > spaceBelow;

    setPos({
      top: openAbove ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, rect.right - 340),
      above: openAbove,
    });
  }, [open, anchorRef]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? window.innerHeight - pos.top : undefined,
        left: pos.left,
      }}
      className="fixed z-[9999] w-[340px] rounded-xl border-[0.5px] border-border bg-card p-1 shadow-card"
    >
      <div className="flex flex-col gap-3 py-2">
        {/* Header */}
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Image Model
            </span>
            <button
              type="button"
              onClick={() =>
                setMode(preference.mode === "auto" ? "manual" : "auto")
              }
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                preference.mode === "auto"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  preference.mode === "auto" ? "bg-[#4ADE80]" : "bg-muted-foreground"
                }`}
              />
              {preference.mode === "auto" ? "Auto" : "Manual"}
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {preference.mode === "auto"
              ? "Agent automatically selects the best model for each task"
              : "Using fixed model for all image generation"}
          </span>
        </div>

        {/* Model list */}
        <div className="scrollbar-hidden max-h-[300px] space-y-0.5 overflow-y-auto px-1">
          {models.map((m) => {
            const selected =
              preference.mode === "manual" && preference.model === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted ${
                  selected ? "bg-muted" : ""
                }`}
              >
                {m.iconUrl && (
                  <img
                    src={m.iconUrl}
                    alt={m.displayName}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col">
                  <span className="text-[13px] font-medium text-foreground">
                    {m.displayName}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {m.description}
                  </span>
                </div>
                {selected && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-foreground"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.08 3.087a.583.583 0 0 1 0 .825L5.661 10.33a.583.583 0 0 1-.824 0L1.92 7.412a.583.583 0 0 1 .825-.825L5.25 9.092l6.004-6.005a.583.583 0 0 1 .825 0"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
