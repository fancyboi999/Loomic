"use client";

import { useEffect, useState } from "react";

type GeneratingItem = {
  jobId: string;
  title?: string;
  model?: string;
  placement: { x: number; y: number; width: number; height: number };
  startedAt: number;
};

type Props = {
  items: GeneratingItem[];
  excalidrawApi: any;
};

export function CanvasGeneratingOverlay({ items, excalidrawApi }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (items.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0 || !excalidrawApi) return null;

  const appState = excalidrawApi.getAppState?.();
  if (!appState) return null;

  const zoom = appState.zoom?.value ?? 1;
  const scrollX = appState.scrollX ?? 0;
  const scrollY = appState.scrollY ?? 0;

  return (
    <>
      {items.map((item) => {
        const screenX = (item.placement.x + scrollX) * zoom;
        const screenY = (item.placement.y + scrollY) * zoom;
        const screenW = item.placement.width * zoom;
        const screenH = item.placement.height * zoom;
        const elapsed = Math.floor((Date.now() - item.startedAt) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        return (
          <div
            key={item.jobId}
            className="pointer-events-none absolute z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-black/10 bg-black/[0.04]"
            style={{
              left: screenX,
              top: screenY,
              width: screenW,
              height: screenH,
            }}
          >
            <div className="mb-2 size-6 animate-pulse rounded-full bg-black/10" />
            <span className="text-sm font-medium text-black/30">
              Generating
            </span>
            <span className="mt-1 text-xs text-black/20">{timeStr}</span>
          </div>
        );
      })}
    </>
  );
}
