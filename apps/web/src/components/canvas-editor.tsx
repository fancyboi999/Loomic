"use client";

import "@excalidraw/excalidraw/index.css";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef } from "react";

import { saveCanvas } from "../lib/server-api";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false },
);

type CanvasEditorProps = {
  canvasId: string;
  accessToken: string;
  initialContent: {
    elements: Record<string, unknown>[];
    appState: Record<string, unknown>;
  };
  onApiReady?: (api: any) => void;
};

const SAVE_DEBOUNCE_MS = 1500;

export function CanvasEditor({
  canvasId,
  accessToken,
  initialContent,
  onApiReady,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const content = {
          elements: elements.filter(
            (el: any) => !el.isDeleted,
          ) as Record<string, unknown>[],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridModeEnabled: appState.gridModeEnabled,
          },
        };
        saveCanvas(accessTokenRef.current, canvasId, content).catch(
          console.error,
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [canvasId],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="h-full w-full">
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        initialData={{
          elements: initialContent.elements as any,
          appState: initialContent.appState as any,
        }}
        onChange={handleChange}
        {...(onApiReady ? { excalidrawAPI: onApiReady } : {})}
      />
    </div>
  );
}
