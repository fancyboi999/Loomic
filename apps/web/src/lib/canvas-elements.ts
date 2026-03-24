import type { ImageArtifact } from "@loomic/shared";

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
}): Record<string, unknown> {
  return {
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
}

/**
 * Fetch an image URL and convert it to a data URL string.
 */
export async function fetchAsDataURL(url: string): Promise<string> {
  const response = await fetch(url);
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
    updateScene: (scene: { elements: any[] }) => void;
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

  const scaled = scaleToFit(artifact.width, artifact.height, 600);
  const center = getViewportCenter(api.getAppState());

  const element = createExcalidrawImageElement({
    fileId,
    x: center.x - scaled.width / 2,
    y: center.y - scaled.height / 2,
    width: scaled.width,
    height: scaled.height,
  });

  api.updateScene({
    elements: [...api.getSceneElements(), element],
  });
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}
