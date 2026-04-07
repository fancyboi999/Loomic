// apps/server/src/features/canvas/canvas-element-writer.ts

import type { CanvasContent, Json } from "@loomic/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CanvasElement = Record<string, unknown>;

type ImageInsertOpts = {
  canvasId: string;
  objectPath: string;       // Storage path for oss:// marker (already uploaded by worker)
  width: number;
  height: number;
  mimeType: string;
  title?: string;
};

type VideoInsertOpts = {
  canvasId: string;
  signedUrl: string;        // Public URL for embeddable link
  width: number;
  height: number;
  mimeType: string;
  durationSeconds?: number;
  title?: string;
  prompt?: string;
};

type Placement = { x: number; y: number; width: number; height: number };

type InsertResult = { elementId: string };

// ---------------------------------------------------------------------------
// Placement calculation (ported from apps/web/src/lib/canvas-elements.ts)
// ---------------------------------------------------------------------------

function scaleToFit(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) return { width, height };
  const ratio = Math.min(maxSize / width, maxSize / height);
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function calculateAutoPlacement(
  elements: CanvasElement[],
  assetWidth: number,
  assetHeight: number,
  maxSize: number,
): Placement {
  const scaled = scaleToFit(assetWidth, assetHeight, maxSize);
  const visible = elements.filter((el) => !el.isDeleted);

  if (visible.length === 0) {
    // Empty canvas: center around origin
    return {
      x: -scaled.width / 2,
      y: -scaled.height / 2,
      width: scaled.width,
      height: scaled.height,
    };
  }

  // Place right of the rightmost element with 40px gap
  const GAP = 40;
  let maxRight = -Infinity;
  let rightEdgeY = 0;
  for (const el of visible) {
    const elRight = (Number(el.x) || 0) + (Number(el.width) || 0);
    if (elRight > maxRight) {
      maxRight = elRight;
      rightEdgeY = (Number(el.y) || 0) + (Number(el.height) || 0) / 2;
    }
  }
  return {
    x: maxRight + GAP,
    y: rightEdgeY - scaled.height / 2,
    width: scaled.width,
    height: scaled.height,
  };
}

// ---------------------------------------------------------------------------
// Element builders
// ---------------------------------------------------------------------------

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

function buildImageElement(
  fileId: string,
  placement: Placement,
  opts: ImageInsertOpts,
): CanvasElement {
  return {
    type: "image",
    id: generateId(),
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    angle: 0,
    fileId,
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
    customData: {
      ...(opts.title ? { title: opts.title } : {}),
      source: "generated" as const,
    },
  };
}

function buildVideoElement(
  placement: Placement,
  opts: VideoInsertOpts,
): CanvasElement {
  return {
    type: "embeddable",
    id: generateId(),
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    angle: 0,
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
    link: opts.signedUrl,
    locked: false,
    customData: {
      isVideo: true,
      mimeType: opts.mimeType,
      ...(opts.durationSeconds != null ? { durationSeconds: opts.durationSeconds } : {}),
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.prompt ? { prompt: opts.prompt } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Public API — Read-Modify-Write canvas content
// ---------------------------------------------------------------------------

const CANVAS_FILES_BUCKET = "project-assets";
const IMAGE_MAX_SIZE = 600;
const VIDEO_MAX_SIZE = 800;

/**
 * Insert an image element into a canvas. Reads current content, appends element
 * with auto-placement (or explicit placement), writes it back.
 *
 * The image file is already in Supabase Storage (uploaded by worker executor).
 * We download it and embed as base64 dataURL in the canvas files map so
 * Excalidraw can render it natively (consistent with frontend-inserted images).
 */
export async function insertImageElement(
  client: { from: (table: string) => any; storage: { from: (bucket: string) => any } },
  opts: ImageInsertOpts,
  explicitPlacement?: Placement,
): Promise<InsertResult> {
  // 1. Download image from storage and convert to base64 dataURL
  const { data: blob, error: dlError } = await client
    .storage.from(CANVAS_FILES_BUCKET)
    .download(opts.objectPath);

  if (dlError || !blob) {
    throw new Error(`Failed to download image from storage: ${dlError?.message ?? "no data"}`);
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataURL = `data:${opts.mimeType};base64,${base64}`;

  // 2. Read canvas
  const { data, error } = await client
    .from("canvases")
    .select("content")
    .eq("id", opts.canvasId)
    .single();

  if (error || !data) {
    throw new Error(`Canvas not found: ${opts.canvasId}`);
  }

  const content = (data.content as CanvasContent) ?? { elements: [], appState: {} };
  const elements: CanvasElement[] = (content.elements as CanvasElement[]) ?? [];
  const files = ((content as any).files as Record<string, Record<string, unknown>>) ?? {};

  // 3. Placement
  const placement = explicitPlacement ?? calculateAutoPlacement(
    elements, opts.width, opts.height, IMAGE_MAX_SIZE,
  );

  // 4. Build element + files entry with base64 dataURL
  const fileId = generateId();
  const element = buildImageElement(fileId, placement, opts);

  const updatedFiles = {
    ...files,
    [fileId]: {
      id: fileId,
      dataURL,
      mimeType: opts.mimeType,
      created: Date.now(),
    },
  };

  // 5. Write
  const updatedContent = {
    ...content,
    elements: [...elements, element],
    files: updatedFiles,
  };

  const { error: writeError } = await client
    .from("canvases")
    .update({ content: updatedContent as unknown as Json })
    .eq("id", opts.canvasId);

  if (writeError) {
    throw new Error(`Failed to write canvas: ${writeError.message}`);
  }

  console.log(`[canvas-element-writer] image inserted canvasId=${opts.canvasId} elementId=${element.id}`);
  return { elementId: element.id as string };
}

/**
 * Insert a video element into a canvas. Videos use Excalidraw's `embeddable`
 * type with a link URL — no files map entry needed.
 */
export async function insertVideoElement(
  client: { from: (table: string) => any; storage: { from: (bucket: string) => any } },
  opts: VideoInsertOpts,
  explicitPlacement?: Placement,
): Promise<InsertResult> {
  // 1. Read
  const { data, error } = await client
    .from("canvases")
    .select("content")
    .eq("id", opts.canvasId)
    .single();

  if (error || !data) {
    throw new Error(`Canvas not found: ${opts.canvasId}`);
  }

  const content = (data.content as CanvasContent) ?? { elements: [], appState: {} };
  const elements: CanvasElement[] = (content.elements as CanvasElement[]) ?? [];

  // 2. Placement
  const placement = explicitPlacement ?? calculateAutoPlacement(
    elements, opts.width, opts.height, VIDEO_MAX_SIZE,
  );

  // 3. Build element
  const element = buildVideoElement(placement, opts);

  // 4. Write
  const updatedContent = {
    ...content,
    elements: [...elements, element],
  };

  const { error: writeError } = await client
    .from("canvases")
    .update({ content: updatedContent as unknown as Json })
    .eq("id", opts.canvasId);

  if (writeError) {
    throw new Error(`Failed to write canvas: ${writeError.message}`);
  }

  console.log(`[canvas-element-writer] video inserted canvasId=${opts.canvasId} elementId=${element.id}`);
  return { elementId: element.id as string };
}
