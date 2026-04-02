import { tool } from "langchain";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Note: color coercion (number → hex string) moved to runtime handler.
// Gemini cannot represent z.preprocess/z.transform in JSON Schema.

const labelSchema = z
  .object({
    text: z.string().min(1).describe("Label text centered inside the shape"),
    fontSize: z.number().default(20).describe("Label font size"),
    strokeColor: z.string().default("#000000").describe("Label text color hex"),
  })
  .optional()
  .describe("Optional centered text label inside the shape");

// Flat object schema — Gemini doesn't support union/oneOf/anyOf in tool params.
// All fields are optional; which ones are required depends on `action`.
const operationSchema = z.object({
  action: z
    .enum([
      "move", "resize", "delete", "update_style",
      "add_text", "add_shape", "add_line",
      "reorder", "align", "distribute",
    ])
    .describe("The operation to perform"),

  // Common: target element ID (move, resize, delete, update_style, reorder)
  element_id: z.string().optional().describe("ID of element to operate on"),

  // Position / size
  x: z.number().optional().describe("X coordinate"),
  y: z.number().optional().describe("Y coordinate"),
  width: z.number().optional().describe("Width"),
  height: z.number().optional().describe("Height"),

  // Style (update_style, add_shape, add_line, add_text)
  strokeColor: z.string().optional().describe("Stroke/text color hex, e.g. #FF0000"),
  backgroundColor: z.string().optional().describe("Fill color hex"),
  opacity: z.number().optional().describe("Opacity 0-100"),
  fontSize: z.number().optional().describe("Font size"),
  strokeWidth: z.number().optional().describe("Stroke width"),
  fillStyle: z.enum(["solid", "hachure", "cross-hatch"]).optional().describe("Fill style"),

  // add_text
  text: z.string().optional().describe("Text content (add_text)"),

  // add_shape
  shape: z.enum(["rectangle", "ellipse", "diamond"]).optional().describe("Shape type (add_shape)"),
  label: labelSchema,

  // add_line
  line_type: z.enum(["line", "arrow"]).optional().describe("Line or arrow (add_line)"),
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional()
    .describe("Array of {x,y} points (add_line, optional when using bindings)"),
  start_element_id: z.string().optional().describe("Bind arrow start to this element ID"),
  end_element_id: z.string().optional().describe("Bind arrow end to this element ID"),

  // reorder
  position: z.enum(["front", "back"]).optional().describe("Bring to front or send to back (reorder)"),

  // align / distribute
  element_ids: z.array(z.string()).optional().describe("IDs of elements (align/distribute)"),
  alignment: z
    .enum(["left", "right", "center", "top", "bottom", "middle"])
    .optional()
    .describe("Alignment direction (align)"),
  direction: z.enum(["horizontal", "vertical"]).optional().describe("Distribution direction (distribute)"),
});

const manipulateCanvasSchema = z.object({
  operations: z
    .array(operationSchema)
    .min(1)
    .describe("List of operations to apply"),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CanvasElement = Record<string, unknown>;
// Flat operation type — all fields optional except `action`.
type Operation = z.infer<typeof operationSchema>;

type HandlerResult = {
  description: string;
  createdId?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

/**
 * Estimate text width accounting for CJK characters.
 * CJK characters ≈ 1.0× fontSize; Latin/ASCII ≈ 0.6× fontSize.
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
    width += isCJK ? fontSize : fontSize * 0.6;
  }
  return width;
}

/** Coerce numeric color values to hex strings at runtime (models sometimes emit numbers). */
function coerceColor(v: unknown, fallback: string): string {
  if (typeof v === "number") return `#${v.toString(16).padStart(6, "0")}`;
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

function createElementBase(): CanvasElement {
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

function bumpVersion(el: CanvasElement): void {
  el.version = ((el.version as number) ?? 0) + 1;
  el.versionNonce = Math.floor(Math.random() * 2_000_000_000);
  el.updated = Date.now();
}

function findElement(
  elements: CanvasElement[],
  id: string,
): CanvasElement | undefined {
  return elements.find((el) => el.id === id && !el.isDeleted);
}

function shortLabel(el: CanvasElement): string {
  if (el.type === "text" && typeof el.text === "string") {
    const short =
      el.text.length > 20 ? el.text.slice(0, 17) + "..." : el.text;
    return `text '${short}'`;
  }
  return `${el.type ?? "element"}(${el.id})`;
}

function ensureBoundElements(el: CanvasElement): unknown[] {
  if (!Array.isArray(el.boundElements)) {
    el.boundElements = [];
  }
  return el.boundElements as unknown[];
}

// ---------------------------------------------------------------------------
// Arrow binding geometry
// ---------------------------------------------------------------------------

const BINDING_GAP = 8;

function getElementCenter(el: CanvasElement): { cx: number; cy: number } {
  const x = Number(el.x) || 0;
  const y = Number(el.y) || 0;
  const w = Number(el.width) || 0;
  const h = Number(el.height) || 0;
  return { cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Compute the point on a shape's edge where a ray from its center toward
 * `target` exits, plus a gap offset.
 */
function computeEdgePoint(
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

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

function applyMove(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const el = findElement(elements, op.element_id!);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };
  el.x = op.x;
  el.y = op.y;
  bumpVersion(el);
  return { description: `moved ${shortLabel(el)} to (${op.x}, ${op.y})` };
}

function applyResize(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const el = findElement(elements, op.element_id!);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };
  el.width = op.width;
  el.height = op.height;
  bumpVersion(el);
  return {
    description: `resized ${shortLabel(el)} to ${op.width}x${op.height}`,
  };
}

function applyDelete(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const el = findElement(elements, op.element_id!);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };
  el.isDeleted = true;
  bumpVersion(el);
  return { description: `deleted ${shortLabel(el)}` };
}

function applyUpdateStyle(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const el = findElement(elements, op.element_id!);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };

  const applied: string[] = [];
  const props = [
    "strokeColor",
    "backgroundColor",
    "opacity",
    "fontSize",
    "strokeWidth",
  ] as const;
  for (const key of props) {
    if (op[key] !== undefined) {
      el[key] = op[key];
      applied.push(key);
    }
  }
  bumpVersion(el);
  return {
    description: `updated ${shortLabel(el)} style: ${applied.join(", ")}`,
  };
}

function applyAddText(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const id = generateId();
  const el: CanvasElement = {
    ...createElementBase(),
    id,
    type: "text",
    text: op.text!,
    x: op.x,
    y: op.y,
    width: measureTextWidth(op.text!, op.fontSize ?? 20),
    height: (op.fontSize ?? 20) * 1.25,
    fontSize: op.fontSize ?? 20,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
    strokeColor: op.strokeColor ?? "#000000",
    containerId: null,
    originalText: op.text!,
    autoResize: true,
    lineHeight: 1.25,
  };
  elements.push(el);
  const short =
    op.text!.length > 20 ? op.text!.slice(0, 17) + "..." : op.text!;
  return {
    description: `added text '${short}' at (${op.x}, ${op.y}) [id=${id}]`,
    createdId: id,
  };
}

function applyAddShape(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const shapeId = generateId();
  const el: CanvasElement = {
    ...createElementBase(),
    id: shapeId,
    type: op.shape,
    x: op.x,
    y: op.y,
    width: op.width,
    height: op.height,
    strokeColor: op.strokeColor ?? "#000000",
    backgroundColor: op.backgroundColor ?? "transparent",
    fillStyle: op.fillStyle ?? "solid",
  };

  if (op.label) {
    const textId = generateId();
    const fontSize = op.label.fontSize;

    // For multi-line labels, measure the longest line and compute total height
    const lines = op.label.text.split("\n");
    const textWidth = Math.max(...lines.map((l) => measureTextWidth(l, fontSize)));
    const textHeight = lines.length * fontSize * 1.25;

    // Enforce minimum shape size so text never overflows the container
    const paddingX = 40;
    const paddingY = 40;
    const minWidth = textWidth + paddingX;
    const minHeight = textHeight + paddingY;
    el.width = Math.max(Number(el.width) || 0, minWidth);
    el.height = Math.max(Number(el.height) || 0, minHeight);

    // Bind text to shape
    ensureBoundElements(el).push({ type: "text", id: textId });

    const textEl: CanvasElement = {
      ...createElementBase(),
      id: textId,
      type: "text",
      text: op.label.text,
      originalText: op.label.text,
      x: Number(el.x) + (Number(el.width) - textWidth) / 2,
      y: Number(el.y) + (Number(el.height) - textHeight) / 2,
      width: textWidth,
      height: textHeight,
      fontSize,
      fontFamily: 1,
      textAlign: "center",
      verticalAlign: "middle",
      strokeColor: op.label.strokeColor,
      containerId: shapeId,
      autoResize: true,
      lineHeight: 1.25,
    };

    elements.push(el);
    elements.push(textEl);

    const short =
      op.label.text.length > 20
        ? op.label.text.slice(0, 17) + "..."
        : op.label.text;
    return {
      description: `added ${op.shape} ${op.width}x${op.height} with label '${short}' at (${op.x}, ${op.y}) [id=${shapeId}]`,
      createdId: shapeId,
    };
  }

  elements.push(el);
  return {
    description: `added ${op.shape} ${op.width}x${op.height} at (${op.x}, ${op.y}) [id=${shapeId}]`,
    createdId: shapeId,
  };
}

function applyAddLine(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const hasBinding = op.start_element_id || op.end_element_id;

  if (hasBinding) {
    return applyAddBoundLine(elements, op);
  }

  // Non-binding path: points are required
  if (!op.points || op.points.length < 2) {
    return {
      description:
        "[skip] add_line without bindings requires points (>= 2)",
    };
  }

  // Auto-derive origin from first point if x/y not provided.
  // Excalidraw stores points relative to the element's x/y origin.
  const originX = op.x ?? op.points[0]!.x;
  const originY = op.y ?? op.points[0]!.y;
  const excalidrawPoints = op.points.map((p) => [p.x - originX, p.y - originY]);

  const relXs = excalidrawPoints.map((p) => p[0]!);
  const relYs = excalidrawPoints.map((p) => p[1]!);
  const width = Math.abs(Math.max(...relXs) - Math.min(...relXs));
  const height = Math.abs(Math.max(...relYs) - Math.min(...relYs));

  const arrowId = generateId();
  const el: CanvasElement = {
    ...createElementBase(),
    id: arrowId,
    type: op.line_type ?? "arrow",
    x: originX,
    y: originY,
    width,
    height,
    points: excalidrawPoints,
    strokeColor: op.strokeColor ?? "#000000",
    strokeWidth: op.strokeWidth ?? 2,
    lastCommittedPoint: excalidrawPoints[excalidrawPoints.length - 1],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: op.line_type === "arrow" ? "arrow" : null,
  };
  elements.push(el);
  return {
    description: `added ${op.line_type} with ${op.points.length} points at (${originX}, ${originY}) [id=${arrowId}]`,
    createdId: arrowId,
  };
}

function applyAddBoundLine(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const startEl = op.start_element_id
    ? findElement(elements, op.start_element_id)
    : null;
  const endEl = op.end_element_id
    ? findElement(elements, op.end_element_id)
    : null;

  if (op.start_element_id && !startEl) {
    return {
      description: `[skip] start element ${op.start_element_id} not found`,
    };
  }
  if (op.end_element_id && !endEl) {
    return {
      description: `[skip] end element ${op.end_element_id} not found`,
    };
  }

  const startCenter = startEl
    ? getElementCenter(startEl)
    : { cx: op.x ?? 0, cy: op.y ?? 0 };
  const endCenter = endEl
    ? getElementCenter(endEl)
    : { cx: (op.x ?? 0) + 100, cy: op.y ?? 0 };

  const startPoint = startEl
    ? computeEdgePoint(startEl, { x: endCenter.cx, y: endCenter.cy })
    : { x: startCenter.cx, y: startCenter.cy };

  const endPoint = endEl
    ? computeEdgePoint(endEl, { x: startCenter.cx, y: startCenter.cy })
    : { x: endCenter.cx, y: endCenter.cy };

  const arrowId = generateId();
  const relEnd = {
    x: endPoint.x - startPoint.x,
    y: endPoint.y - startPoint.y,
  };

  let startBinding: unknown = null;
  let endBinding: unknown = null;

  if (startEl) {
    startBinding = {
      elementId: op.start_element_id,
      focus: 0,
      gap: BINDING_GAP,
      fixedPoint: null,
    };
    ensureBoundElements(startEl).push({ type: "arrow", id: arrowId });
    bumpVersion(startEl);
  }

  if (endEl) {
    endBinding = {
      elementId: op.end_element_id,
      focus: 0,
      gap: BINDING_GAP,
      fixedPoint: null,
    };
    ensureBoundElements(endEl).push({ type: "arrow", id: arrowId });
    bumpVersion(endEl);
  }

  const el: CanvasElement = {
    ...createElementBase(),
    id: arrowId,
    type: op.line_type ?? "arrow",
    x: startPoint.x,
    y: startPoint.y,
    width: Math.abs(relEnd.x),
    height: Math.abs(relEnd.y),
    points: [
      [0, 0],
      [relEnd.x, relEnd.y],
    ],
    strokeColor: op.strokeColor ?? "#000000",
    strokeWidth: op.strokeWidth ?? 2,
    lastCommittedPoint: [relEnd.x, relEnd.y],
    startBinding,
    endBinding,
    startArrowhead: null,
    endArrowhead: op.line_type === "arrow" || !op.line_type ? "arrow" : null,
  };
  elements.push(el);

  const fromLabel = op.start_element_id ?? "free";
  const toLabel = op.end_element_id ?? "free";
  return {
    description: `added bound ${op.line_type ?? "arrow"} ${fromLabel} → ${toLabel} [id=${arrowId}]`,
    createdId: arrowId,
  };
}

function applyReorder(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const idx = elements.findIndex(
    (el) => el.id === op.element_id && !el.isDeleted,
  );
  if (idx === -1)
    return { description: `[skip] element ${op.element_id} not found` };

  const removed = elements.splice(idx, 1);
  const el = removed[0]!;
  if (op.position === "front") {
    elements.push(el);
  } else {
    elements.unshift(el);
  }
  bumpVersion(el);
  return { description: `reordered ${shortLabel(el)} to ${op.position}` };
}

function applyAlign(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const targets = (op.element_ids ?? [])
    .map((id) => findElement(elements, id))
    .filter((el): el is CanvasElement => el !== undefined);

  if (targets.length < 2) {
    return {
      description: `[skip] need >= 2 valid elements to align, found ${targets.length}`,
    };
  }

  switch (op.alignment) {
    case "left": {
      const minX = Math.min(...targets.map((el) => Number(el.x) || 0));
      for (const el of targets) {
        el.x = minX;
        bumpVersion(el);
      }
      break;
    }
    case "right": {
      const maxRight = Math.max(
        ...targets.map(
          (el) => (Number(el.x) || 0) + (Number(el.width) || 0),
        ),
      );
      for (const el of targets) {
        el.x = maxRight - (Number(el.width) || 0);
        bumpVersion(el);
      }
      break;
    }
    case "center": {
      const centers = targets.map(
        (el) => (Number(el.x) || 0) + (Number(el.width) || 0) / 2,
      );
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      for (const el of targets) {
        el.x = avg - (Number(el.width) || 0) / 2;
        bumpVersion(el);
      }
      break;
    }
    case "top": {
      const minY = Math.min(...targets.map((el) => Number(el.y) || 0));
      for (const el of targets) {
        el.y = minY;
        bumpVersion(el);
      }
      break;
    }
    case "bottom": {
      const maxBottom = Math.max(
        ...targets.map(
          (el) => (Number(el.y) || 0) + (Number(el.height) || 0),
        ),
      );
      for (const el of targets) {
        el.y = maxBottom - (Number(el.height) || 0);
        bumpVersion(el);
      }
      break;
    }
    case "middle": {
      const middles = targets.map(
        (el) => (Number(el.y) || 0) + (Number(el.height) || 0) / 2,
      );
      const avg = middles.reduce((a, b) => a + b, 0) / middles.length;
      for (const el of targets) {
        el.y = avg - (Number(el.height) || 0) / 2;
        bumpVersion(el);
      }
      break;
    }
  }

  return {
    description: `aligned ${targets.length} elements ${op.alignment}`,
  };
}

function applyDistribute(
  elements: CanvasElement[],
  op: Operation,
): HandlerResult {
  const targets = (op.element_ids ?? [])
    .map((id) => findElement(elements, id))
    .filter((el): el is CanvasElement => el !== undefined);

  if (targets.length < 3) {
    return {
      description: `[skip] need >= 3 valid elements to distribute, found ${targets.length}`,
    };
  }

  if (op.direction === "horizontal") {
    targets.sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0));
    const first = targets[0]!;
    const last = targets[targets.length - 1]!;
    const totalSpan =
      (Number(last.x) || 0) +
      (Number(last.width) || 0) -
      (Number(first.x) || 0);
    const totalWidths = targets.reduce(
      (sum, el) => sum + (Number(el.width) || 0),
      0,
    );
    const gap = (totalSpan - totalWidths) / (targets.length - 1);

    let currentX = Number(first.x) || 0;
    for (const el of targets) {
      el.x = currentX;
      bumpVersion(el);
      currentX += (Number(el.width) || 0) + gap;
    }
  } else {
    targets.sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
    const first = targets[0]!;
    const last = targets[targets.length - 1]!;
    const totalSpan =
      (Number(last.y) || 0) +
      (Number(last.height) || 0) -
      (Number(first.y) || 0);
    const totalHeights = targets.reduce(
      (sum, el) => sum + (Number(el.height) || 0),
      0,
    );
    const gap = (totalSpan - totalHeights) / (targets.length - 1);

    let currentY = Number(first.y) || 0;
    for (const el of targets) {
      el.y = currentY;
      bumpVersion(el);
      currentY += (Number(el.height) || 0) + gap;
    }
  }

  return {
    description: `distributed ${targets.length} elements ${op.direction}ly`,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const handlers: Record<
  Operation["action"],
  (elements: CanvasElement[], op: any) => HandlerResult
> = {
  move: applyMove,
  resize: applyResize,
  delete: applyDelete,
  update_style: applyUpdateStyle,
  add_text: applyAddText,
  add_shape: applyAddShape,
  add_line: applyAddLine,
  reorder: applyReorder,
  align: applyAlign,
  distribute: applyDistribute,
};

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createManipulateCanvasTool(deps: {
  createUserClient: (accessToken: string) => any;
}) {
  return tool(
    async (input, config) => {
      const canvasId = (config as any)?.configurable?.canvas_id;
      const accessToken = (config as any)?.configurable?.access_token;

      if (!canvasId || !accessToken) {
        return JSON.stringify({
          error: "no_canvas_context",
          message:
            "This tool requires a canvas context. Ensure the conversation is linked to a canvas.",
        });
      }

      // --- Read current canvas -------------------------------------------------
      const client = deps.createUserClient(accessToken);
      const { data, error } = await client
        .from("canvases")
        .select("content")
        .eq("id", canvasId)
        .single();

      if (error || !data) {
        return JSON.stringify({
          error: "canvas_not_found",
          message: "Canvas not found or access denied.",
        });
      }

      const content = data.content as {
        elements?: CanvasElement[];
        appState?: Record<string, unknown>;
      };
      const elements: CanvasElement[] = content.elements ?? [];

      // --- Apply operations ----------------------------------------------------
      const descriptions: string[] = [];
      const errors: string[] = [];
      const createdIds: Record<string, string> = {};

      for (let i = 0; i < input.operations.length; i++) {
        const op = input.operations[i]!;
        try {
          const handler = handlers[op.action];
          const result = handler(elements, op);
          if (result.description.startsWith("[skip]")) {
            errors.push(result.description);
          } else {
            descriptions.push(result.description);
            if (result.createdId) {
              createdIds[`op_${i}`] = result.createdId;
            }
          }
        } catch (e) {
          errors.push(`[error] ${op.action}: ${(e as Error).message}`);
        }
      }

      // --- Write back ----------------------------------------------------------
      const updatedContent = { ...content, elements };
      const { error: writeError } = await client
        .from("canvases")
        .update({ content: updatedContent })
        .eq("id", canvasId);

      if (writeError) {
        return JSON.stringify({
          error: "write_failed",
          message: `Failed to save canvas: ${writeError.message}`,
        });
      }

      // --- Build result --------------------------------------------------------
      const result: Record<string, unknown> = {
        success: true,
        applied: descriptions.length,
        summary: descriptions.join("; "),
      };
      if (Object.keys(createdIds).length > 0) {
        result.createdIds = createdIds;
      }
      if (errors.length > 0) {
        result.errors = errors;
      }
      return JSON.stringify(result);
    },
    {
      name: "manipulate_canvas",
      description:
        "Manipulate elements on the canvas. Supports: move, resize, delete, update_style, add_text, add_shape (with optional label for centered text), add_line (with optional element binding for auto-connected arrows), align, distribute, reorder. Use inspect_canvas first to understand the current layout. Returns created element IDs for subsequent binding.",
      schema: manipulateCanvasSchema,
    },
  );
}
