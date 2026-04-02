import type { ImageArtifact, VideoArtifact } from "@loomic/shared";

import { getServerBaseUrl } from "./env";

/**
 * Scale dimensions to fit within maxSize while preserving aspect ratio.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }
  const ratio = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Compute the center of the current Excalidraw viewport.
 */
export function getViewportCenter(appState: {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: { value: number };
}): { x: number; y: number } {
  const zoom = appState.zoom?.value ?? 1;
  return {
    x: -appState.scrollX + appState.width / (2 * zoom),
    y: -appState.scrollY + appState.height / (2 * zoom),
  };
}

/**
 * Create an Excalidraw image element with all required fields.
 */
export function createExcalidrawImageElement(opts: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  source?: "generated" | "uploaded";
  storageUrl?: string;
}): Record<string, unknown> {
  const element: Record<string, unknown> = {
    type: "image",
    id: generateId(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    angle: 0,
    fileId: opts.fileId,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: null,
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
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
  if (opts.title || opts.source || opts.storageUrl) {
    element.customData = {
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.source ? { source: opts.source } : {}),
      ...(opts.storageUrl ? { storageUrl: opts.storageUrl } : {}),
    };
  }
  return element;
}

/**
 * Fetch an image URL and convert it to a data URL string.
 * Routes through the server proxy to bypass browser CORS restrictions.
 */
export async function fetchAsDataURL(url: string): Promise<string> {
  const proxyUrl = `${getServerBaseUrl()}/api/proxy-image?url=${encodeURIComponent(url)}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error("Failed to convert image to data URL"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Insert an image artifact onto the Excalidraw canvas.
 */
export async function insertImageOnCanvas(
  api: {
    addFiles: (
      files: { id: any; dataURL: any; mimeType: string; created: number }[],
    ) => void;
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: {
      elements: any[];
      captureUpdate?: string;
    }) => void;
  },
  artifact: ImageArtifact,
): Promise<void> {
  const dataURL = await fetchAsDataURL(artifact.url);
  const fileId = generateId();

  api.addFiles([
    {
      id: fileId as any,
      dataURL: dataURL as any,
      mimeType: artifact.mimeType,
      created: Date.now(),
    },
  ]);

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (artifact.placement) {
    // Agent-controlled placement
    x = artifact.placement.x;
    y = artifact.placement.y;
    width = artifact.placement.width;
    height = artifact.placement.height;
  } else {
    // Smart auto-placement: viewport center if empty, next to elements if not
    const scaled = scaleToFit(artifact.width, artifact.height, 600);
    width = scaled.width;
    height = scaled.height;

    const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);

    if (elements.length === 0) {
      // Empty canvas → viewport center
      const center = getViewportCenter(api.getAppState());
      x = center.x - width / 2;
      y = center.y - height / 2;
    } else {
      // Has elements → place to the right of the rightmost element with gap
      const GAP = 40;
      let maxRight = -Infinity;
      let rightEdgeY = 0;

      for (const el of elements) {
        const elRight = (el.x ?? 0) + (el.width ?? 0);
        if (elRight > maxRight) {
          maxRight = elRight;
          // Vertically align center of new image with center of rightmost element
          rightEdgeY = (el.y ?? 0) + (el.height ?? 0) / 2;
        }
      }

      x = maxRight + GAP;
      y = rightEdgeY - height / 2;
    }
  }

  const element = createExcalidrawImageElement({
    fileId,
    x,
    y,
    width,
    height,
    ...(artifact.title ? { title: artifact.title } : {}),
    source: "generated",
    storageUrl: artifact.url,
  });

  api.updateScene({
    elements: [...api.getSceneElements(), element],
    captureUpdate: "IMMEDIATELY",
  });
}

/**
 * Extract the first frame of a video as a PNG data URL.
 * Uses a hidden <video> + <canvas> to capture the frame in-browser.
 * Falls back to a generated placeholder if extraction fails.
 */
export function extractVideoPosterFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";

    const timeout = setTimeout(() => {
      video.src = "";
      resolve(generateVideoPlaceholder());
    }, 10_000);

    video.addEventListener("loadeddata", () => {
      video.currentTime = 0.1;
    });

    video.addEventListener("seeked", () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(generateVideoPlaceholder());
        }
      } catch {
        resolve(generateVideoPlaceholder());
      } finally {
        video.src = "";
      }
    });

    video.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve(generateVideoPlaceholder());
    });

    // Route through proxy to avoid CORS issues
    const proxyUrl = `${getServerBaseUrl()}/api/proxy-image?url=${encodeURIComponent(videoUrl)}`;
    video.src = proxyUrl;
  });
}

function generateVideoPlaceholder(width = 1280, height = 720): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const size = Math.min(width, height) * 0.15;
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy - size * 0.5);
  ctx.lineTo(cx + size * 0.6, cy);
  ctx.lineTo(cx - size * 0.4, cy + size * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `${Math.round(size * 0.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Video", cx, cy + size * 0.9);

  return canvas.toDataURL("image/png");
}

/**
 * Insert a video artifact onto the Excalidraw canvas.
 * Videos display as image elements (poster frame) with video metadata in customData.
 */
export async function insertVideoOnCanvas(
  api: {
    addFiles: (
      files: { id: any; dataURL: any; mimeType: string; created: number }[],
    ) => void;
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: {
      elements: any[];
      captureUpdate?: string;
    }) => void;
  },
  artifact: VideoArtifact,
): Promise<void> {
  const posterDataURL = await extractVideoPosterFrame(artifact.url);
  const fileId = generateId();

  api.addFiles([
    {
      id: fileId as any,
      dataURL: posterDataURL as any,
      mimeType: "image/png",
      created: Date.now(),
    },
  ]);

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (artifact.placement) {
    x = artifact.placement.x;
    y = artifact.placement.y;
    width = artifact.placement.width;
    height = artifact.placement.height;
  } else {
    const scaled = scaleToFit(artifact.width, artifact.height, 600);
    width = scaled.width;
    height = scaled.height;

    const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);

    if (elements.length === 0) {
      const center = getViewportCenter(api.getAppState());
      x = center.x - width / 2;
      y = center.y - height / 2;
    } else {
      const GAP = 40;
      let maxRight = -Infinity;
      let rightEdgeY = 0;
      for (const el of elements) {
        const elRight = (el.x ?? 0) + (el.width ?? 0);
        if (elRight > maxRight) {
          maxRight = elRight;
          rightEdgeY = (el.y ?? 0);
        }
      }
      x = maxRight + GAP;
      y = rightEdgeY;
    }
  }

  const element = createExcalidrawImageElement({
    fileId,
    x,
    y,
    width,
    height,
    ...(artifact.title ? { title: artifact.title } : {}),
  });

  element.customData = {
    ...(element.customData as Record<string, unknown> | undefined),
    isVideo: true,
    videoUrl: artifact.url,
    mimeType: artifact.mimeType,
    durationSeconds: artifact.durationSeconds,
  };

  const existing = api.getSceneElements();
  api.updateScene({
    elements: [...existing, element],
    captureUpdate: "IMMEDIATELY",
  });
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}
