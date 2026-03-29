"use client";

import "@excalidraw/excalidraw/index.css";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WebSocketHandle } from "../hooks/use-websocket";
import { saveCanvas, uploadThumbnail } from "../lib/server-api";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";
import { CanvasToolMenu } from "./canvas-tool-menu";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false },
);

export type CanvasSelectedElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fileId?: string;
  dataUrl?: string;
};

type CanvasEditorProps = {
  canvasId: string;
  projectId: string;
  accessToken: string;
  initialContent: {
    elements: Record<string, unknown>[];
    appState: Record<string, unknown>;
    files: Record<string, Record<string, unknown>>;
  };
  onApiReady?: (api: any) => void;
  ws?: WebSocketHandle;
  leftPanelOpen?: boolean;
  onSelectionChange?: (elements: CanvasSelectedElement[]) => void;
};

const SAVE_DEBOUNCE_MS = 1500;
const THUMBNAIL_DEBOUNCE_MS = 10_000;
const THUMBNAIL_MAX_SIZE = 400;

export function CanvasEditor({
  canvasId,
  projectId,
  accessToken,
  initialContent,
  onApiReady,
  ws,
  leftPanelOpen,
  onSelectionChange,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const [excalidrawApi, setExcalidrawApi] = useState<any>(null);
  const prevSelectedIdsRef = useRef<string>("");
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Separate inline files (ready) from storage URLs (need async fetch)
  const { inlineFiles, pendingUrls } = useMemo(() => {
    const inline: Record<string, Record<string, unknown>> = {};
    const pending: Array<{ fileId: string; url: string; meta: Record<string, unknown> }> = [];
    for (const [fileId, fileData] of Object.entries(initialContent.files)) {
      if (typeof fileData.storageUrl === "string" && fileData.storageUrl) {
        pending.push({ fileId, url: fileData.storageUrl, meta: fileData });
      } else {
        inline[fileId] = fileData;
      }
    }
    return { inlineFiles: inline, pendingUrls: pending };
  }, [initialContent.files]);

  // Lazily resolve storage URLs and inject into Excalidraw
  useEffect(() => {
    if (!excalidrawApi || pendingUrls.length === 0) return;
    let cancelled = false;

    async function resolveFiles() {
      const resolved: Record<string, any> = {};
      await Promise.all(
        pendingUrls.map(async ({ fileId, url, meta }) => {
          try {
            const resp = await fetch(url);
            if (!resp.ok) return;
            const blob = await resp.blob();
            const reader = new FileReader();
            const dataURL = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            resolved[fileId] = {
              id: meta.id ?? fileId,
              mimeType: meta.mimeType ?? blob.type,
              created: meta.created ?? Date.now(),
              dataURL,
            };
          } catch {
            // Skip failed files silently
          }
        }),
      );
      if (!cancelled && Object.keys(resolved).length > 0) {
        excalidrawApi.addFiles(Object.values(resolved));
      }
    }

    resolveFiles();
    return () => { cancelled = true; };
  }, [excalidrawApi, pendingUrls]);

  const handleExcalidrawApi = useCallback(
    (api: any) => {
      setExcalidrawApi(api);
      onApiReady?.(api);
    },
    [onApiReady],
  );

  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const files: Record<string, Record<string, unknown>> = {};
        if (excalidrawApi) {
          const rawFiles = excalidrawApi.getFiles() as Record<string, any>;
          for (const [id, file] of Object.entries(rawFiles)) {
            files[id] = {
              id: file.id,
              dataURL: file.dataURL,
              mimeType: file.mimeType,
              created: file.created,
            };
          }
        }
        const content = {
          elements: elements.filter(
            (el: any) => !el.isDeleted,
          ) as Record<string, unknown>[],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridModeEnabled: appState.gridModeEnabled,
          },
          files,
        };
        saveCanvas(accessTokenRef.current, canvasId, content).catch(
          console.error,
        );
      }, SAVE_DEBOUNCE_MS);

      // Debounced thumbnail generation — runs less frequently than save
      if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
      thumbnailTimerRef.current = setTimeout(async () => {
        if (!excalidrawApi) return;
        try {
          const { exportToBlob } = await import("@excalidraw/excalidraw");
          const sceneElements = excalidrawApi.getSceneElements();
          const sceneFiles = excalidrawApi.getFiles();
          if (!sceneElements.length) return;

          const blob = await exportToBlob({
            elements: sceneElements,
            appState: { exportBackground: true },
            files: sceneFiles,
            mimeType: "image/webp",
            quality: 0.8,
            maxWidthOrHeight: THUMBNAIL_MAX_SIZE,
          });

          console.log("[canvas-editor] uploading thumbnail, blob size:", blob.size);
          await uploadThumbnail(accessTokenRef.current, projectId, blob);
          console.log("[canvas-editor] thumbnail uploaded OK");
        } catch (err) {
          console.warn("[canvas-editor] thumbnail generation/upload failed:", err);
        }
      }, THUMBNAIL_DEBOUNCE_MS);

      // Detect selection changes — only fire callback when selected IDs actually change
      const selectedIds = appState.selectedElementIds
        ? Object.keys(appState.selectedElementIds as Record<string, boolean>).filter(
            (id) => (appState.selectedElementIds as Record<string, boolean>)[id],
          ).sort().join(",")
        : "";

      if (selectedIds !== prevSelectedIdsRef.current) {
        prevSelectedIdsRef.current = selectedIds;
        if (onSelectionChangeRef.current) {
          if (!selectedIds) {
            onSelectionChangeRef.current([]);
          } else {
            const idSet = new Set(selectedIds.split(","));
            const files: Record<string, any> = excalidrawApi?.getFiles() ?? {};
            const selected: CanvasSelectedElement[] = elements
              .filter((el: any) => idSet.has(el.id) && !el.isDeleted)
              .map((el: any) => {
                const base: CanvasSelectedElement = {
                  id: el.id,
                  type: el.type,
                  x: el.x ?? 0,
                  y: el.y ?? 0,
                  width: el.width ?? 0,
                  height: el.height ?? 0,
                };
                if (el.type === "text" && el.text) {
                  base.text = el.text;
                }
                if (el.type === "image" && el.fileId) {
                  base.fileId = el.fileId;
                  const file = files[el.fileId];
                  if (file?.dataURL) {
                    base.dataUrl = file.dataURL;
                  }
                }
                return base;
              });
            onSelectionChangeRef.current(selected);
          }
        }
      }
    },
    [canvasId, projectId, excalidrawApi],
  );

  // Register screenshot RPC handler so the server can request canvas captures
  useEffect(() => {
    if (!ws || !excalidrawApi) return;

    const cleanup = ws.registerRPC(
      "canvas.screenshot",
      async (params) => {
        const { mode, region, max_dimension = 1024 } = params as {
          mode: string;
          region?: { x: number; y: number; width: number; height: number };
          max_dimension?: number;
        };

        const allElements = excalidrawApi
          .getSceneElements()
          .filter((e: any) => !e.isDeleted);
        const appState = excalidrawApi.getAppState();
        const files = excalidrawApi.getFiles();

        let elements = allElements;

        if (mode === "region" && region) {
          elements = allElements.filter((el: any) => {
            const ex = (el.x as number) ?? 0;
            const ey = (el.y as number) ?? 0;
            const ew = (el.width as number) ?? 0;
            const eh = (el.height as number) ?? 0;
            return !(
              ex + ew < region.x ||
              ex > region.x + region.width ||
              ey + eh < region.y ||
              ey > region.y + region.height
            );
          });
        } else if (mode === "viewport") {
          const zoom = (appState.zoom?.value as number) ?? 1;
          const sx = -((appState.scrollX as number) ?? 0);
          const sy = -((appState.scrollY as number) ?? 0);
          const vw = ((appState.width as number) ?? 1920) / zoom;
          const vh = ((appState.height as number) ?? 1080) / zoom;
          elements = allElements.filter((el: any) => {
            const ex = (el.x as number) ?? 0;
            const ey = (el.y as number) ?? 0;
            const ew = (el.width as number) ?? 0;
            const eh = (el.height as number) ?? 0;
            return !(
              ex + ew < sx || ex > sx + vw || ey + eh < sy || ey > sy + vh
            );
          });
        }

        const { exportToBlob } = await import("@excalidraw/excalidraw");
        const blob = await exportToBlob({
          elements,
          appState: { ...appState, exportBackground: true },
          files,
          maxWidthOrHeight: max_dimension,
          mimeType: "image/png",
        });

        // Convert blob to base64 data URL directly (no upload needed —
        // the image is passed inline to the model for visual understanding)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to convert screenshot to data URL"));
          reader.readAsDataURL(blob);
        });

        const bmp = await createImageBitmap(blob);
        const width = bmp.width;
        const height = bmp.height;
        bmp.close();

        return { url: dataUrl, width, height };
      },
    );

    return cleanup;
  }, [ws, excalidrawApi, canvasId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (thumbnailTimerRef.current) clearTimeout(thumbnailTimerRef.current);
    };
  }, []);

  return (
    <div className="h-full w-full relative">
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        initialData={{
          elements: initialContent.elements as any,
          appState: initialContent.appState as any,
          files: inlineFiles as any,
        }}
        onChange={handleChange}
        excalidrawAPI={handleExcalidrawApi}
      />
      {excalidrawApi && (
        <CanvasToolMenu
          accessToken={accessToken}
          excalidrawApi={excalidrawApi}
          leftPanelOpen={leftPanelOpen}
        />
      )}
    </div>
  );
}
