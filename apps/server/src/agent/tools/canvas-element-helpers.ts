/**
 * canvas-element-helpers.ts
 *
 * Shared helper functions and types extracted from manipulate-canvas.ts.
 * Covers:
 *   - Core type aliases (CanvasElement, HandlerResult)
 *   - ID / version utilities (generateId, bumpVersion)
 *   - Text measurement (measureTextWidth)
 *   - Color coercion (coerceColor)
 *   - Element construction base (createElementBase)
 *   - Element lookup and labelling (findElement, shortLabel)
 *   - Binding utilities (ensureBoundElements, validateBindings)
 *   - Arrow geometry constants and helpers
 *     (BINDING_GAP, getElementCenter, computeEdgePoint, computeFixedPoint)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Loose typed canvas element matching Excalidraw's JSON structure. */
export type CanvasElement = Record<string, unknown>;

/** Result returned by every operation handler. */
export type HandlerResult = {
  description: string;
  createdId?: string;
};

// ---------------------------------------------------------------------------
// ID / version utilities
// ---------------------------------------------------------------------------

/** Generate a 20-character random alphanumeric ID (matches Excalidraw format). */
export function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

/** Increment element version and refresh versionNonce + updated timestamp. */
export function bumpVersion(el: CanvasElement): void {
  el.version = ((el.version as number) ?? 0) + 1;
  el.versionNonce = Math.floor(Math.random() * 2_000_000_000);
  el.updated = Date.now();
}

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

/**
 * Estimate text width accounting for CJK characters.
 * Calibrated for Excalidraw's Virgil font:
 *   CJK characters ≈ 1.05× fontSize; Latin/ASCII ≈ 0.65× fontSize.
 * A 15% safety margin is applied to avoid text overflow.
 */
export function measureTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isCJK =
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x3000 && code <= 0x303f) || // CJK Symbols & Punctuation
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0xff00 && code <= 0xffef) || // Fullwidth Forms
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0x20000 && code <= 0x2a6df); // CJK Extension B
    width += isCJK ? fontSize * 1.05 : fontSize * 0.65;
  }
  // +15% safety margin so text never clips on real render
  return width * 1.15;
}

// ---------------------------------------------------------------------------
// Color coercion
// ---------------------------------------------------------------------------

/**
 * Coerce numeric color values to hex strings at runtime.
 * LLMs (particularly Gemini) sometimes emit color values as integers
 * instead of "#RRGGBB" strings.
 */
export function coerceColor(v: unknown, fallback: string): string {
  if (typeof v === "number") return `#${v.toString(16).padStart(6, "0")}`;
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

// ---------------------------------------------------------------------------
// Element construction
// ---------------------------------------------------------------------------

/**
 * Return a base element object with all mandatory Excalidraw fields populated.
 * Callers spread this and add type-specific fields.
 */
export function createElementBase(): CanvasElement {
  return {
    id: generateId(),
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
    boundElements: [],
    frameId: null,
    index: null,
    seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false,
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

// ---------------------------------------------------------------------------
// Element lookup and labelling
// ---------------------------------------------------------------------------

/** Find an active (non-deleted) element by ID. */
export function findElement(
  elements: CanvasElement[],
  id: string,
): CanvasElement | undefined {
  return elements.find((el) => el.id === id && !el.isDeleted);
}

/** Return a short human-readable label for log / result messages. */
export function shortLabel(el: CanvasElement): string {
  if (el.type === "text" && typeof el.text === "string") {
    const short =
      el.text.length > 20 ? el.text.slice(0, 17) + "..." : el.text;
    return `text '${short}'`;
  }
  return `${el.type ?? "element"}(${el.id})`;
}

// ---------------------------------------------------------------------------
// Binding utilities
// ---------------------------------------------------------------------------

/**
 * Ensure `el.boundElements` is an array and return it.
 * Mutates the element in-place if the field was missing or non-array.
 */
export function ensureBoundElements(el: CanvasElement): unknown[] {
  if (!Array.isArray(el.boundElements)) {
    el.boundElements = [];
  }
  return el.boundElements as unknown[];
}

/**
 * Post-processing pass: remove stale binding references after any batch of
 * operations (e.g. after delete). Fixes orphaned boundElements, containerId,
 * and arrow bindings pointing to deleted elements.
 *
 * Must be called after all operations in a batch have been applied so that
 * cascaded deletes are fully visible before cleanup runs.
 */
export function validateBindings(elements: CanvasElement[]): void {
  const activeIds = new Set(
    elements.filter((el) => !el.isDeleted).map((el) => el.id as string),
  );
  for (const el of elements) {
    if (el.isDeleted) continue;
    if (Array.isArray(el.boundElements)) {
      const before = (el.boundElements as Array<{ id: string }>).length;
      el.boundElements = (
        el.boundElements as Array<{ id: string; type: string }>
      ).filter((b) => activeIds.has(b.id));
      if ((el.boundElements as unknown[]).length !== before) bumpVersion(el);
    }
    if (el.containerId && !activeIds.has(el.containerId as string)) {
      el.containerId = null;
      bumpVersion(el);
    }
    if (el.startBinding) {
      const binding = el.startBinding as { elementId: string };
      if (!activeIds.has(binding.elementId)) {
        el.startBinding = null;
        bumpVersion(el);
      }
    }
    if (el.endBinding) {
      const binding = el.endBinding as { elementId: string };
      if (!activeIds.has(binding.elementId)) {
        el.endBinding = null;
        bumpVersion(el);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Arrow binding geometry
// ---------------------------------------------------------------------------

/**
 * Gap (in canvas units) between a bound shape's edge and the arrow endpoint.
 * Matches Excalidraw's default binding gap so arrows look naturally attached.
 */
export const BINDING_GAP = 8;

/** Return the center point of a canvas element. */
export function getElementCenter(el: CanvasElement): { cx: number; cy: number } {
  const x = Number(el.x) || 0;
  const y = Number(el.y) || 0;
  const w = Number(el.width) || 0;
  const h = Number(el.height) || 0;
  return { cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Compute the point on a shape's edge where a ray from its center toward
 * `target` exits, plus a `BINDING_GAP` offset.
 * Handles rectangle, ellipse, and diamond shapes.
 */
export function computeEdgePoint(
  shape: CanvasElement,
  target: { x: number; y: number },
): { x: number; y: number } {
  const { cx, cy } = getElementCenter(shape);
  const hw = (Number(shape.width) || 0) / 2;
  const hh = (Number(shape.height) || 0) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: cx, y: cy - hh - BINDING_GAP };
  const nx = dx / len;
  const ny = dy / len;

  const shapeType = shape.type as string;

  if (shapeType === "ellipse") {
    const angle = Math.atan2(ny * hw, nx * hh);
    return {
      x: cx + (hw + BINDING_GAP) * Math.cos(angle),
      y: cy + (hh + BINDING_GAP) * Math.sin(angle),
    };
  }

  if (shapeType === "diamond") {
    const absDx = Math.abs(nx);
    const absDy = Math.abs(ny);
    const denom = absDx * hh + absDy * hw;
    const t = denom > 0 ? (hw * hh) / denom : 1;
    return {
      x: cx + nx * (t + BINDING_GAP),
      y: cy + ny * (t + BINDING_GAP),
    };
  }

  // Rectangle: ray-box intersection
  const tx = nx !== 0 ? hw / Math.abs(nx) : Infinity;
  const ty = ny !== 0 ? hh / Math.abs(ny) : Infinity;
  const t = Math.min(tx, ty);
  return {
    x: cx + nx * (t + BINDING_GAP),
    y: cy + ny * (t + BINDING_GAP),
  };
}

/**
 * Compute the normalized fixedPoint [x, y] on `fromShape`'s boundary that
 * best faces `toShape`. Values are in [0, 1] space (top-left = [0, 0]).
 * This stabilises arrow endpoints so Excalidraw does not recompute them when
 * bound shapes are resized.
 */
export function computeFixedPoint(
  fromShape: CanvasElement,
  toShape: CanvasElement,
): [number, number] {
  const fromCenter = getElementCenter(fromShape);
  const toCenter = getElementCenter(toShape);
  const dx = toCenter.cx - fromCenter.cx;
  const dy = toCenter.cy - fromCenter.cy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx > absDy) {
    return dx > 0 ? [1, 0.5] : [0, 0.5];
  } else {
    return dy > 0 ? [0.5, 1] : [0.5, 0];
  }
}
