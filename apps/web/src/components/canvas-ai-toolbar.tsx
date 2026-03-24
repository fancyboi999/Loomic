"use client";

import { useState } from "react";

import { CanvasImageGenPanel } from "./canvas-image-gen-panel";

type CanvasAIToolbarProps = {
  accessToken: string;
  excalidrawApi: any;
};

export function CanvasAIToolbar({
  accessToken,
  excalidrawApi,
}: CanvasAIToolbarProps) {
  const [activePanel, setActivePanel] = useState<"image" | "video" | null>(
    null,
  );

  return (
    <>
      {/* AI toolbar buttons — positioned to the right of Excalidraw's toolbar */}
      <div className="absolute bottom-4 left-1/2 translate-x-[220px] flex gap-1 z-50">
        <button
          onClick={() =>
            setActivePanel(activePanel === "image" ? null : "image")
          }
          className={`flex items-center justify-center h-9 w-9 rounded-lg text-sm transition-colors ${
            activePanel === "image"
              ? "bg-foreground text-background"
              : "bg-white/90 text-foreground hover:bg-white shadow-sm border border-neutral-200"
          }`}
          title="AI Image"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <button
          onClick={() =>
            setActivePanel(activePanel === "video" ? null : "video")
          }
          className={`flex items-center justify-center h-9 w-9 rounded-lg text-sm transition-colors ${
            activePanel === "video"
              ? "bg-foreground text-background"
              : "bg-white/90 text-foreground hover:bg-white shadow-sm border border-neutral-200"
          }`}
          title="AI Video (Coming soon)"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polygon points="10,8 16,12 10,16" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Floating panels */}
      {activePanel === "image" && (
        <CanvasImageGenPanel
          accessToken={accessToken}
          excalidrawApi={excalidrawApi}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "video" && (
        <div className="absolute bottom-16 left-1/2 translate-x-[220px] z-50 w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#2F3640]">AI Video</h3>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#A4A9B2] hover:text-[#2F3640] transition-colors"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-[#A4A9B2]">Coming soon</p>
        </div>
      )}
    </>
  );
}
