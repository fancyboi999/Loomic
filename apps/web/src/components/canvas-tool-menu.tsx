"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { ImageGeneratorPanel } from "./canvas/image-generator-panel";

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

export function CanvasToolMenu({ accessToken, excalidrawApi, leftPanelOpen }: CanvasToolMenuProps) {
  const [activeTool, setActiveTool] = useState<string>("selection");
  const [activePanel, setActivePanel] = useState<"ai-video" | null>(null);

  // Image generator state
  const [activeGeneratorId, setActiveGeneratorId] = useState<string | null>(null);
  const [generatorData, setGeneratorData] = useState<ImageGeneratorData | null>(null);
  const [generatorBounds, setGeneratorBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
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
    }>
  >([]);

  // Keep activeGeneratorId accessible inside onChange without causing re-subscription
  const activeGeneratorIdRef = useRef(activeGeneratorId);
  activeGeneratorIdRef.current = activeGeneratorId;

  // Subscribe to Excalidraw changes
  useEffect(() => {
    if (!excalidrawApi) return;

    const unsubscribe = excalidrawApi.onChange(
      (elements: any[], appState: any) => {
        const tool = appState?.activeTool?.type;
        if (tool) setActiveTool(tool);

        const scrollX = appState?.scrollX ?? 0;
        const scrollY = appState?.scrollY ?? 0;
        const zoom = appState?.zoom?.value ?? 1;
        setCanvasScrollZoom({ scrollX, scrollY, zoom });

        // Check if an image-generator element is selected
        const selectedIds = appState?.selectedElementIds ?? {};
        const selectedElements = elements.filter(
          (el: any) => selectedIds[el.id] && !el.isDeleted,
        );

        const currentId = activeGeneratorIdRef.current;

        if (
          selectedElements.length === 1 &&
          isImageGeneratorElement(selectedElements[0])
        ) {
          const el = selectedElements[0];
          const data = getImageGeneratorData(el);
          setActiveGeneratorId(el.id as string);
          setGeneratorData(data);
          setGeneratorBounds({
            x: el.x as number,
            y: el.y as number,
            width: el.width as number,
            height: el.height as number,
          });
        } else if (currentId) {
          // Element is no longer selected — close the panel
          setActiveGeneratorId(null);
          setGeneratorData(null);
          setGeneratorBounds(null);
        }

        // Find all generating elements for shimmer overlay
        const generating = elements
          .filter(
            (el: any) =>
              !el.isDeleted &&
              isImageGeneratorElement(el) &&
              el.customData?.status === "generating",
          )
          .map((el: any) => ({
            id: el.id as string,
            screenX: ((el.x as number) + scrollX) * zoom,
            screenY: ((el.y as number) + scrollY) * zoom,
            screenW: (el.width as number) * zoom,
            screenH: (el.height as number) * zoom,
          }));
        setGeneratingElements(generating);
      },
    );

    return unsubscribe;
  }, [excalidrawApi]);

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

        {/* AI Image — creates a placeholder on canvas */}
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

        {/* AI Video */}
        <button
          type="button"
          title="AI 生成视频 (Coming soon)"
          onClick={() =>
            setActivePanel(activePanel === "ai-video" ? null : "ai-video")
          }
          className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer ${
            activePanel === "ai-video"
              ? "bg-black/[0.08] text-[#1b1b1f]"
              : "text-[#1b1b1f]/60 hover:bg-black/[0.04] hover:text-[#1b1b1f]"
          }`}
        >
          <Video className="size-[16px]" />
        </button>
      </div>

      {/* Image Generator Panel — floats below the selected placeholder */}
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

      {/* Shimmer overlays for generating elements */}
      {generatingElements.length > 0 &&
        createPortal(
          <>
            {generatingElements.map((el) => (
              <div
                key={el.id}
                className="pointer-events-none fixed overflow-hidden rounded-lg"
                style={{
                  left: el.screenX,
                  top: el.screenY,
                  width: el.screenW,
                  height: el.screenH,
                  zIndex: 99,
                }}
              >
                {/* Mountain icon placeholder */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F3F4F6]">
                  <svg
                    className="h-12 w-12 text-[#D1D5DB]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                  <span className="mt-1 text-[11px] text-[#9CA3AF]">
                    Generating...
                  </span>
                </div>
                {/* Shimmer scan effect */}
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
            ))}
          </>,
          document.body,
        )}

      {/* AI Video panel */}
      {activePanel === "ai-video" && (
        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 z-50 w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#2F3640]">AI Video</h3>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#A4A9B2] hover:text-[#2F3640] transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
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
