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
      {/* AI toolbar buttons — top-right, below the nav bar */}
      <div
        className="absolute top-3 right-3 z-20 flex gap-0.5 rounded-xl p-1 bg-white/75 backdrop-blur-lg border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
      >
        <button
          onClick={() =>
            setActivePanel(activePanel === "image" ? null : "image")
          }
          className={`flex items-center justify-center h-8 w-8 rounded-lg text-sm transition-colors cursor-pointer ${
            activePanel === "image"
              ? "bg-violet-100 text-violet-700"
              : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
          }`}
          title="AI Image"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              fill="currentColor"
              fillOpacity="0.9"
              d="M11.75 3a.75.75 0 0 1 0 1.5h-5A2.25 2.25 0 0 0 4.5 6.75v7.513l2.28-2.145a1.75 1.75 0 0 1 2.437.037L12 14.94l.763-.762a1.75 1.75 0 0 1 2.474 0l4.041 4.04c.14-.293.222-.62.222-.967v-5a.75.75 0 0 1 1.5 0v5A3.75 3.75 0 0 1 17.25 21H6.75A3.75 3.75 0 0 1 3 17.25V6.75A3.75 3.75 0 0 1 6.75 3zM8.155 13.216a.25.25 0 0 0-.347-.005L4.5 16.323v.927a2.25 2.25 0 0 0 2.25 2.25h10.5c.347 0 .674-.081.968-.222l-4.041-4.04a.25.25 0 0 0-.315-.033l-.039.032-1.293 1.293a.75.75 0 0 1-1.06 0zM18 2c.241 0 .457.148.544.373l.696 1.813a1 1 0 0 0 .575.574l1.812.696a.583.583 0 0 1 0 1.088l-1.812.696a1 1 0 0 0-.575.574l-.696 1.813a.583.583 0 0 1-1.088 0l-.696-1.813a1 1 0 0 0-.575-.574l-1.812-.696a.583.583 0 0 1 0-1.088l1.813-.696a1 1 0 0 0 .574-.574l.696-1.813A.58.58 0 0 1 18 2"
            />
          </svg>
        </button>
        <button
          onClick={() =>
            setActivePanel(activePanel === "video" ? null : "video")
          }
          className={`flex items-center justify-center h-8 w-8 rounded-lg text-sm transition-colors cursor-pointer ${
            activePanel === "video"
              ? "bg-violet-100 text-violet-700"
              : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
          }`}
          title="AI Video (Coming soon)"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              fill="currentColor"
              fillOpacity="0.9"
              d="M11.977 3a.75.75 0 0 1 0 1.5h-5a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-5a.75.75 0 0 1 1.5 0v5a3.75 3.75 0 0 1-3.75 3.75h-10.5a3.75 3.75 0 0 1-3.75-3.75V6.75A3.75 3.75 0 0 1 6.977 3zm-1.558 5.827a.75.75 0 0 1 .788.078l3.25 2.5a.75.75 0 0 1 0 1.19l-3.25 2.5A.75.75 0 0 1 10 14.5v-5l.008-.105a.75.75 0 0 1 .41-.568M18.227 2c.24 0 .457.148.543.373l.698 1.813a1 1 0 0 0 .574.574l1.811.696a.583.583 0 0 1 0 1.088l-1.811.696a1 1 0 0 0-.574.574l-.698 1.813a.583.583 0 0 1-1.086 0l-.698-1.813a1 1 0 0 0-.574-.574l-1.811-.696a.584.584 0 0 1 0-1.088l1.811-.696a1 1 0 0 0 .574-.574l.698-1.813A.58.58 0 0 1 18.227 2"
            />
          </svg>
        </button>
      </div>

      {/* Floating panels — anchored below the AI toolbar */}
      {activePanel === "image" && (
        <div className="absolute top-14 right-3 z-50">
          <CanvasImageGenPanel
            accessToken={accessToken}
            excalidrawApi={excalidrawApi}
            onClose={() => setActivePanel(null)}
          />
        </div>
      )}
      {activePanel === "video" && (
        <div className="absolute top-14 right-3 z-50 w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
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
