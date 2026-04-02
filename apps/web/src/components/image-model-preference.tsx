"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Zap } from "lucide-react";

import type { ImageModelInfo } from "../lib/server-api";
import type { VideoModelInfo } from "../lib/server-api";
import { fetchImageModels, fetchVideoModels } from "../lib/server-api";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";

export function ImageModelPreferencePopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { preference, setMode, toggleModel } = useImageModelPreference();
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");
  const videoPreference = useVideoModelPreference();
  const [videoModels, setVideoModels] = useState<VideoModelInfo[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchImageModels()
      .then((data) => setModels(data.models))
      .catch(() => {});
    fetchVideoModels()
      .then((data) => setVideoModels(data.models))
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
      left: Math.max(8, rect.right - 380),
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

  const currentPreference = activeTab === "image" ? preference : videoPreference.preference;
  const currentModels = activeTab === "image" ? models : videoModels;
  const currentSetMode = activeTab === "image" ? setMode : videoPreference.setMode;
  const currentToggleModel = activeTab === "image" ? toggleModel : videoPreference.toggleModel;

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? window.innerHeight - pos.top : undefined,
        left: pos.left,
      }}
      className="fixed z-[9999] w-[380px] rounded-xl border-[0.5px] border-border bg-card p-1 shadow-card"
    >
      <div className="flex flex-col gap-3 py-2">
        {/* Tab switcher */}
        <div className="px-3">
          <div className="flex rounded-lg bg-muted p-0.5">
            {(["image", "video"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "image" ? "Image" : "Video"}
              </button>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              {activeTab === "image" ? "Image Model" : "Video Model"}
            </span>
            <button
              type="button"
              onClick={() =>
                currentSetMode(currentPreference.mode === "auto" ? "manual" : "auto")
              }
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                currentPreference.mode === "auto"
                  ? "bg-accent/15 text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  currentPreference.mode === "auto" ? "bg-accent" : "bg-muted-foreground"
                }`}
              />
              {currentPreference.mode === "auto" ? "Auto" : "Manual"}
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {currentPreference.mode === "auto"
              ? `Agent automatically selects the best model for each ${activeTab} task`
              : `Agent chooses from your selected models for each ${activeTab} task`}
          </span>
        </div>

        {/* Model list */}
        <div className="scrollbar-hidden max-h-[300px] space-y-0.5 overflow-y-auto px-1">
          {currentModels.map((m) => {
            const selected = currentPreference.models.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => currentToggleModel(m.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                  selected ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-muted"
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
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    {m.displayName}
                    {m.accessible === false && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold uppercase leading-tight tracking-wider bg-neutral-600/40 text-neutral-400">
                        <Lock className="h-2.5 w-2.5" />
                        {m.minTier ?? "PRO"}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
                    {m.description}
                    {typeof m.creditCost === "number" && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums text-neutral-500">
                        <Zap className="h-2.5 w-2.5" />
                        {m.creditCost}
                      </span>
                    )}
                  </span>
                </div>
                {selected && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-accent-foreground"
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
