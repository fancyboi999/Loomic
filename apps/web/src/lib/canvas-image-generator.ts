import { getViewportCenter } from "./canvas-elements";

// Aspect ratio to pixel dimensions mapping (at 1K base)
const RATIO_DIMENSIONS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1024, h: 576 },
  "9:16": { w: 576, h: 1024 },
  "4:3": { w: 1024, h: 768 },
  "3:4": { w: 768, h: 1024 },
};

export type ImageGeneratorStatus = "idle" | "generating" | "completed" | "error";

export type ImageGeneratorData = {
  type: "image-generator";
  status: ImageGeneratorStatus;
  prompt: string;
  model: string;
  aspectRatio: string;
  quality: string;
  inputImages?: string[];
  errorMessage?: string;
};

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

/**
 * Get display dimensions for an aspect ratio, scaled to fit nicely on canvas.
 * Canvas display size is smaller than actual generation size.
 */
export function getDisplayDimensions(
  aspectRatio: string,
  displayMaxSize = 400,
): { width: number; height: number } {
  const dims = RATIO_DIMENSIONS[aspectRatio] ?? RATIO_DIMENSIONS["1:1"]!;
  const scale = Math.min(displayMaxSize / dims.w, displayMaxSize / dims.h);
  return {
    width: Math.round(dims.w * scale),
    height: Math.round(dims.h * scale),
  };
}

/**
 * Get the actual generation dimensions for an aspect ratio and quality level.
 */
export function getGenerationDimensions(
  aspectRatio: string,
  quality: string,
): { width: number; height: number } {
  const dims = RATIO_DIMENSIONS[aspectRatio] ?? RATIO_DIMENSIONS["1:1"]!;
  const multiplier = quality === "ultra" ? 4 : quality === "hd" ? 2 : 1;
  return {
    width: dims.w * multiplier,
    height: dims.h * multiplier,
  };
}

/**
 * Create an Excalidraw rectangle element that serves as an image generator placeholder.
 */
export function createImageGeneratorElement(
  api: {
    getAppState: () => any;
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  options?: {
    aspectRatio?: string;
    model?: string;
    quality?: string;
  },
): string {
  const aspectRatio = options?.aspectRatio ?? "1:1";
  const { width, height } = getDisplayDimensions(aspectRatio);
  const center = getViewportCenter(api.getAppState());

  const customData: ImageGeneratorData = {
    type: "image-generator",
    status: "idle",
    prompt: "",
    model: options?.model ?? "google/nano-banana-2",
    aspectRatio,
    quality: options?.quality ?? "hd",
  };

  const id = generateId();
  const element: Record<string, unknown> = {
    type: "rectangle",
    id,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    angle: 0,
    strokeColor: "#D1D5DB",
    backgroundColor: "#F3F4F6",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: { type: 3 },
    boundElements: null,
    frameId: null,
    index: null,
    seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false,
    updated: Date.now(),
    link: null,
    locked: false,
    customData,
  };

  api.updateScene({
    elements: [...api.getSceneElements(), element],
    captureUpdate: "IMMEDIATELY",
  });

  return id;
}

/**
 * Check if an Excalidraw element is an image-generator placeholder.
 */
export function isImageGeneratorElement(element: any): element is { customData: ImageGeneratorData } & Record<string, unknown> {
  return element?.customData?.type === "image-generator";
}

/**
 * Get the image-generator data from an element, or null if not an image-generator.
 */
export function getImageGeneratorData(element: any): ImageGeneratorData | null {
  if (!isImageGeneratorElement(element)) return null;
  return element.customData as ImageGeneratorData;
}

/**
 * Update the customData of an image-generator element.
 */
export function updateImageGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
  updates: Partial<ImageGeneratorData>,
): void {
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId || !isImageGeneratorElement(el)) return el;
    return {
      ...el,
      customData: { ...el.customData, ...updates },
      version: ((el.version as number | undefined) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

/**
 * Resize an image-generator element when aspect ratio changes.
 */
export function resizeImageGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
  aspectRatio: string,
): void {
  const { width, height } = getDisplayDimensions(aspectRatio);
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId) return el;
    // Keep center position, adjust size
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return {
      ...el,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      customData: { ...el.customData, aspectRatio },
      version: (el.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2_000_000_000),
      updated: Date.now(),
    };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}

/**
 * Delete an image-generator element from the canvas.
 */
export function deleteImageGeneratorElement(
  api: {
    getSceneElements: () => readonly any[];
    updateScene: (scene: { elements: any[]; captureUpdate?: string }) => void;
  },
  elementId: string,
): void {
  const elements = api.getSceneElements().map((el: any) => {
    if (el.id !== elementId) return el;
    return { ...el, isDeleted: true };
  });
  api.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
}
