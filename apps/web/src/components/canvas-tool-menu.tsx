"use client";

import { useCallback, useEffect, useRef, useState, memo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Circle,
  Hand,
  ImageUp,
  Minus,
  MousePointer2,
  Pencil,
  Sparkles,
  Square,
  Type,
  Video,
} from "lucide-react";

import {
  createImageGeneratorElement,
  isImageGeneratorElement,
  getImageGeneratorData,
  type ImageGeneratorData,
} from "../lib/canvas-image-generator";
import {
  createVideoGeneratorElement,
  isVideoGeneratorElement,
  getVideoGeneratorData,
  type VideoGeneratorData,
} from "../lib/canvas-video-generator";
import { isVideoUrl } from "../lib/canvas-elements";
import { ImageGeneratorPanel } from "./canvas/image-generator-panel";
import { VideoGeneratorPanel } from "./canvas/video-generator-panel";
import { VideoPlayerPanel } from "./canvas/video-player-panel";

type ToolType =
  | "hand"
  | "selection"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image";

const TOOL_GROUPS: (ToolType | null)[] = [
  "hand",
  "selection",
  null,
  "rectangle",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  null,
  "text",
  "image",
];

const TOOL_ICONS: Record<ToolType, React.ComponentType<{ className?: string }>> = {
  hand: Hand,
  selection: MousePointer2,
  rectangle: Square,
  ellipse: Circle,
  arrow: ArrowUpRight,
  line: Minus,
  freedraw: Pencil,
  text: Type,
  image: ImageUp,
};

const TOOL_LABELS: Record<ToolType, string> = {
  hand: "拖拽画布 (H)",
  selection: "选择 (V)",
  rectangle: "矩形 (R)",
  ellipse: "椭圆 (O)",
  arrow: "箭头 (A)",
  line: "直线 (L)",
  freedraw: "画笔 (P)",
  text: "文字 (T)",
  image: "图片 (9)",
};

type CanvasToolMenuProps = {
  accessToken: string;
  excalidrawApi: any;
  leftPanelOpen?: boolean;
};

/** Memoized shimmer overlay for a single generating element */
const GeneratingOverlay = memo(function GeneratingOverlay({
  id,
  screenX,
  screenY,
  screenW,
  screenH,
  model,
}: {
  id: string;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  model?: string;
}) {
  return (
    <div
      key={id}
      className="pointer-events-none fixed overflow-hidden rounded-lg"
      style={{
        left: screenX,
        top: screenY,
        width: screenW,
        height: screenH,
        zIndex: 99,
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F3F4F6]">
        <svg
          className="h-12 w-12 text-[#D1D5DB]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
        {model && (
          <span className="mt-2 rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-medium text-[#6B7280]">
            {model.split("/").pop()?.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
          </span>
        )}
        <span className="mt-1 text-[11px] text-[#9CA3AF]">
          Generating...
        </span>
      </div>
      <div className="absolute inset-0 animate-shimmer-scan">
        <div
          className="h-full w-1/2"
          style={{
            background:
              "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
});

export function CanvasToolMenu({ accessToken, excalidrawApi, leftPanelOpen }: CanvasToolMenuProps) {
  const [activeTool, setActiveTool] = useState<string>("selection");

  // Image generator state
  const [activeGeneratorId, setActiveGeneratorId] = useState<string | null>(null);
  const [generatorData, setGeneratorData] = useState<ImageGeneratorData | null>(null);
  const [generatorBounds, setGeneratorBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Video generator state
  const [activeVideoGenId, setActiveVideoGenId] = useState<string | null>(null);
  const [videoGenData, setVideoGenData] = useState<VideoGeneratorData | null>(null);
  const [videoGenBounds, setVideoGenBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Video player state (for completed video elements)
  const [activeVideoPlayerId, setActiveVideoPlayerId] = useState<string | null>(null);
  const [videoPlayerData, setVideoPlayerData] = useState<{
    videoUrl: string;
    mimeType: string;
    durationSeconds?: number;
    title?: string;
  } | null>(null);
  const [videoPlayerBounds, setVideoPlayerBounds] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);

  const [canvasScrollZoom, setCanvasScrollZoom] = useState({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
  });

  // Track generating elements for shimmer overlay
  const [generatingElements, setGeneratingElements] = useState<
    Array<{
      id: string;
      screenX: number;
      screenY: number;
      screenW: number;
      screenH: number;
      model?: string;
    }>
  >([]);

  // Keep activeGeneratorId / activeVideoGenId accessible inside onChange without causing re-subscription
  const activeGeneratorIdRef = useRef(activeGeneratorId);
  activeGeneratorIdRef.current = activeGeneratorId;
  const activeVideoGenIdRef = useRef(activeVideoGenId);
  activeVideoGenIdRef.current = activeVideoGenId;
  const activeVideoPlayerIdRef = useRef(activeVideoPlayerId);
  activeVideoPlayerIdRef.current = activeVideoPlayerId;

  // Track previous generating element IDs to avoid re-renders when nothing changed
  const prevGeneratingKeyRef = useRef("");

  // Helper: close all generator / player panels
  const closeAllPanels = useCallback(() => {
    setActiveGeneratorId(null);
    setGeneratorData(null);
    setGeneratorBounds(null);
    setActiveVideoGenId(null);
    setVideoGenData(null);
    setVideoGenBounds(null);
    setActiveVideoPlayerId(null);
    setVideoPlayerData(null);
    setVideoPlayerBounds(null);
  }, []);

  // Subscribe to Excalidraw changes.
  // This fires on every frame during drag / drawing, so we must be very
  // careful to avoid unnecessary state updates that trigger re-renders.
  useEffect(() => {
    if (!excalidrawApi) return;

    const unsubscribe = excalidrawApi.onChange(
      (elements: any[], appState: any) => {
        // --- Tool sync (cheap string comparison, skip if unchanged) ---
        const tool = appState?.activeTool?.type;
        if (tool) setActiveTool((prev: string) => prev === tool ? prev : tool);

        const scrollX = appState?.scrollX ?? 0;
        const scrollY = appState?.scrollY ?? 0;
        const zoom = appState?.zoom?.value ?? 1;
        // Only update scroll/zoom state if values actually changed
        setCanvasScrollZoom((prev) => {
          if (prev.scrollX === scrollX && prev.scrollY === scrollY && prev.zoom === zoom) return prev;
          return { scrollX, scrollY, zoom };
        });

        // --- Selection-based panel management ---
        const selectedIds = appState?.selectedElementIds ?? {};
        const selectedElements = elements.filter(
          (el: any) => selectedIds[el.id] && !el.isDeleted,
        );

        const currentId = activeGeneratorIdRef.current;
        const currentVideoId = activeVideoGenIdRef.current;

        if (selectedElements.length === 1) {
          const sel = selectedElements[0];

          if (isImageGeneratorElement(sel)) {
            // Only update if the selected generator changed
            if (currentId !== sel.id) {
              const data = getImageGeneratorData(sel);
              setActiveGeneratorId(sel.id as string);
              setGeneratorData(data);
              if (currentVideoId) { setActiveVideoGenId(null); setVideoGenData(null); setVideoGenBounds(null); }
              if (activeVideoPlayerIdRef.current) { setActiveVideoPlayerId(null); setVideoPlayerData(null); setVideoPlayerBounds(null); }
            }
            // Always update bounds (element may have been moved/resized)
            setGeneratorBounds({
              x: sel.x as number, y: sel.y as number,
              width: sel.width as number, height: sel.height as number,
            });
          } else if (isVideoGeneratorElement(sel)) {
            if (currentVideoId !== sel.id) {
              const data = getVideoGeneratorData(sel);
              setActiveVideoGenId(sel.id as string);
              setVideoGenData(data);
              if (currentId) { setActiveGeneratorId(null); setGeneratorData(null); setGeneratorBounds(null); }
              if (activeVideoPlayerIdRef.current) { setActiveVideoPlayerId(null); setVideoPlayerData(null); setVideoPlayerBounds(null); }
            }
            setVideoGenBounds({
              x: sel.x as number, y: sel.y as number,
              width: sel.width as number, height: sel.height as number,
            });
          } else if (
            sel.type === "embeddable" &&
            (isVideoUrl(sel.link as string) || sel.customData?.isVideo === true)
          ) {
            if (activeVideoPlayerIdRef.current !== sel.id) {
              const videoLink = sel.link as string;
              setActiveVideoPlayerId(sel.id as string);
              setVideoPlayerData({
                videoUrl: videoLink,
                mimeType: (sel.customData?.mimeType as string) ?? "video/mp4",
                ...(sel.customData?.durationSeconds != null
                  ? { durationSeconds: sel.customData.durationSeconds as number }
                  : {}),
                ...(sel.customData?.title != null
                  ? { title: sel.customData.title as string }
                  : {}),
              });
              if (currentId) { setActiveGeneratorId(null); setGeneratorData(null); setGeneratorBounds(null); }
              if (currentVideoId) { setActiveVideoGenId(null); setVideoGenData(null); setVideoGenBounds(null); }
            }
            setVideoPlayerBounds({
              x: sel.x as number, y: sel.y as number,
              width: sel.width as number, height: sel.height as number,
            });
          } else {
            // Neither generator nor video player -- close all if any was open
            if (currentId || currentVideoId || activeVideoPlayerIdRef.current) {
              closeAllPanels();
            }
          }
        } else {
          // Zero or multiple selected -- close all panels if any was open
          if (currentId || currentVideoId || activeVideoPlayerIdRef.current) {
            closeAllPanels();
          }
        }

        // --- Generating elements shimmer overlay ---
        // Build a stable key so we skip setState when the generating set is unchanged.
        const generatingRaw = elements.filter(
          (el: any) =>
            !el.isDeleted &&
            (isImageGeneratorElement(el) || isVideoGeneratorElement(el)) &&
            el.customData?.status === "generating",
        );

        // Quick identity check: IDs + positions as a serialized key
        const genKey = generatingRaw.map((el: any) =>
          `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}`
        ).join("|");

        if (genKey !== prevGeneratingKeyRef.current) {
          prevGeneratingKeyRef.current = genKey;
          const generating = generatingRaw.map((el: any) => ({
            id: el.id as string,
            screenX: ((el.x as number) + scrollX) * zoom,
            screenY: ((el.y as number) + scrollY) * zoom,
            screenW: (el.width as number) * zoom,
            screenH: (el.height as number) * zoom,
            ...(el.customData?.model ? { model: el.customData.model as string } : {}),
          }));
          setGeneratingElements(generating);
        }
      },
    );

    return unsubscribe;
  }, [excalidrawApi, closeAllPanels]);

  const handleToolChange = useCallback(
    (tool: ToolType) => {
      excalidrawApi?.setActiveTool({ type: tool });
    },
    [excalidrawApi],
  );

  const handleCreateImageGenerator = useCallback(() => {
    if (!excalidrawApi) return;
    const elementId = createImageGeneratorElement(excalidrawApi);
    // Select the newly created element so onChange recognises it
    excalidrawApi.updateScene({
      appState: { selectedElementIds: { [elementId]: true } },
    });
    setActiveGeneratorId(elementId);
    // Read back the created element to populate initial state
    const elements = excalidrawApi.getSceneElements();
    const el = elements.find((e: any) => e.id === elementId);
    if (el) {
      setGeneratorData(getImageGeneratorData(el));
      setGeneratorBounds({
        x: el.x as number,
        y: el.y as number,
        width: el.width as number,
        height: el.height as number,
      });
    }
  }, [excalidrawApi]);

  const handleCloseGenerator = useCallback(() => {
    setActiveGeneratorId(null);
    setGeneratorData(null);
    setGeneratorBounds(null);
  }, []);

  const handleCreateVideoGenerator = useCallback(() => {
    if (!excalidrawApi) return;
    const videoId = createVideoGeneratorElement(excalidrawApi, {
      aspectRatio: "16:9",
    });
    excalidrawApi.updateScene({
      appState: { selectedElementIds: { [videoId]: true } },
    });
    setActiveVideoGenId(videoId);
    // Read back the created element to populate initial state
    const elements = excalidrawApi.getSceneElements();
    const el = elements.find((e: any) => e.id === videoId);
    if (el) {
      setVideoGenData(getVideoGeneratorData(el));
      setVideoGenBounds({
        x: el.x as number,
        y: el.y as number,
        width: el.width as number,
        height: el.height as number,
      });
    }
  }, [excalidrawApi]);

  const handleCloseVideoGenerator = useCallback(() => {
    setActiveVideoGenId(null);
    setVideoGenData(null);
    setVideoGenBounds(null);
  }, []);

  const handleCloseVideoPlayer = useCallback(() => {
    setActiveVideoPlayerId(null);
    setVideoPlayerData(null);
    setVideoPlayerBounds(null);
  }, []);

  return (
    <>
      <div
        className="absolute bottom-5 z-30 flex items-center gap-0.5 rounded-xl p-1 bg-card/75 backdrop-blur-lg border border-border shadow-card transition-[left,transform] duration-200"
        style={{
          left: leftPanelOpen ? "calc(140px + 50%)" : "50%",
          transform: "translateX(-50%)",
        }}
      >
        {/* Standard Excalidraw tools */}
        {TOOL_GROUPS.map((tool, i) => {
          if (tool === null) {
            return (
              <div
                key={`sep-${i}`}
                className="mx-0.5 h-6 w-px bg-black/[0.06]"
              />
            );
          }

          const Icon = TOOL_ICONS[tool];
          const isActive = activeTool === tool;

          return (
            <button
              key={tool}
              type="button"
              title={TOOL_LABELS[tool]}
              onMouseDown={(e) => {
                e.preventDefault();
                handleToolChange(tool);
              }}
              className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer ${
                isActive
                  ? "bg-black/[0.08] text-[#1b1b1f]"
                  : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
              }`}
            >
              <Icon className="size-[16px]" />
            </button>
          );
        })}

        {/* Separator before AI tools */}
        <div className="mx-0.5 h-6 w-px bg-black/[0.06]" />

        {/* AI Image -- creates a placeholder on canvas */}
        <button
          type="button"
          title="AI 生成图片"
          onClick={handleCreateImageGenerator}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer ${
            activeGeneratorId
              ? "bg-black/[0.08] text-[#1b1b1f]"
              : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
          }`}
        >
          <Sparkles className="size-[16px]" />
        </button>

        {/* AI Video -- creates a placeholder on canvas */}
        <button
          type="button"
          title="AI 生成视频"
          onClick={handleCreateVideoGenerator}
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer ${
            activeVideoGenId
              ? "bg-black/[0.08] text-[#1b1b1f]"
              : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
          }`}
        >
          <Video className="size-[16px]" />
        </button>
      </div>

      {/* Image Generator Panel -- floats below the selected placeholder */}
      {activeGeneratorId && generatorData && generatorBounds && (
        <ImageGeneratorPanel
          elementId={activeGeneratorId}
          elementBounds={generatorBounds}
          data={generatorData}
          excalidrawApi={excalidrawApi}
          accessToken={accessToken}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseGenerator}
        />
      )}

      {/* Video Generator Panel -- floats below the selected placeholder */}
      {activeVideoGenId && videoGenData && videoGenBounds && (
        <VideoGeneratorPanel
          elementId={activeVideoGenId}
          elementBounds={videoGenBounds}
          data={videoGenData}
          excalidrawApi={excalidrawApi}
          accessToken={accessToken}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseVideoGenerator}
        />
      )}

      {/* Video Player Panel -- floats when a completed video element is selected */}
      {activeVideoPlayerId && videoPlayerData && videoPlayerBounds && (
        <VideoPlayerPanel
          elementId={activeVideoPlayerId}
          elementBounds={videoPlayerBounds}
          videoUrl={videoPlayerData.videoUrl}
          mimeType={videoPlayerData.mimeType}
          {...(videoPlayerData.durationSeconds != null ? { durationSeconds: videoPlayerData.durationSeconds } : {})}
          {...(videoPlayerData.title != null ? { title: videoPlayerData.title } : {})}
          canvasScrollZoom={canvasScrollZoom}
          onClose={handleCloseVideoPlayer}
        />
      )}

      {/* Shimmer overlays for generating elements */}
      {generatingElements.length > 0 &&
        createPortal(
          <>
            {generatingElements.map((el) => (
              <GeneratingOverlay key={el.id} {...el} />
            ))}
          </>,
          document.body,
        )}

    </>
  );
}
