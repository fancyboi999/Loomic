"use client";

import "@excalidraw/excalidraw/index.css";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveCanvas, uploadThumbnail } from "../lib/server-api";
import { CanvasAIToolbar } from "./canvas-ai-toolbar";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false },
);

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
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const [excalidrawApi, setExcalidrawApi] = useState<any>(null);

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
    },
    [canvasId, projectId, excalidrawApi],
  );

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
        <CanvasAIToolbar
          accessToken={accessToken}
          excalidrawApi={excalidrawApi}
        />
      )}
    </div>
  );
}
