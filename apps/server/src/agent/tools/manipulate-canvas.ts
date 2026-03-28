import { tool } from "langchain";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const labelSchema = z
  .object({
    text: z.string().min(1).describe("Label text centered inside the shape"),
    fontSize: z.number().default(20).describe("Label font size"),
    strokeColor: z.string().default("#000000").describe("Label text color"),
  })
  .optional()
  .describe("Optional centered text label inside the shape");

const operationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    element_id: z.string().describe("ID of element to move"),
    x: z.number().describe("New x coordinate (left edge)"),
    y: z.number().describe("New y coordinate (top edge)"),
  }),
  z.object({
    action: z.literal("resize"),
    element_id: z.string().describe("ID of element to resize"),
    width: z.number().positive().describe("New width"),
    height: z.number().positive().describe("New height"),
  }),
  z.object({
    action: z.literal("delete"),
    element_id: z.string().describe("ID of element to delete"),
  }),
  z.object({
    action: z.literal("update_style"),
    element_id: z.string().describe("ID of element to update"),
    strokeColor: z.string().optional().describe("Stroke color hex, e.g. #FF0000"),
    backgroundColor: z.string().optional().describe("Fill color hex"),
    opacity: z.number().min(0).max(100).optional().describe("Opacity 0-100"),
    fontSize: z.number().optional().describe("Font size (text elements only)"),
    strokeWidth: z.number().optional().describe("Stroke width"),
  }),
  z.object({
    action: z.literal("add_text"),
    text: z.string().min(1).describe("Text content"),
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    fontSize: z.number().default(20).describe("Font size"),
    strokeColor: z.string().default("#000000").describe("Text color hex"),
  }),
  z.object({
    action: z.literal("add_shape"),
    shape: z.enum(["rectangle", "ellipse", "diamond"]).describe("Shape type"),
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    width: z.number().positive().describe("Width"),
    height: z.number().positive().describe("Height"),
    strokeColor: z.string().default("#000000").describe("Stroke color hex"),
    backgroundColor: z.string().default("transparent").describe("Fill color hex"),
    fillStyle: z
      .enum(["solid", "hachure", "cross-hatch"])
      .default("solid")
      .describe("Fill style"),
    label: labelSchema,
  }),
  z.object({
    action: z.literal("add_line"),
    line_type: z.enum(["line", "arrow"]).default("arrow").describe("Line or arrow"),
    points: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .min(2)
      .optional()
      .describe("Array of {x, y} points. Optional when using element bindings."),
    x: z.number().optional().describe("Starting x offset. Auto-computed when using bindings."),
    y: z.number().optional().describe("Starting y offset. Auto-computed when using bindings."),
    strokeColor: z.string().default("#000000").describe("Stroke color hex"),
    strokeWidth: z.number().default(2).describe("Stroke width"),
    start_element_id: z
      .string()
      .optional()
      .describe("ID of element to bind arrow start to (auto-computes connection point)"),
    end_element_id: z
      .string()
      .optional()
      .describe("ID of element to bind arrow end to (auto-computes connection point)"),
  }),
  z.object({
    action: z.literal("reorder"),
    element_id: z.string().describe("ID of element to reorder"),
    position: z.enum(["front", "back"]).describe("Bring to front or send to back"),
  }),
  z.object({
    action: z.literal("align"),
    element_ids: z.array(z.string()).min(2).describe("IDs of elements to align"),
    alignment: z
      .enum(["left", "right", "center", "top", "bottom", "middle"])
      .describe("Alignment direction"),
  }),
  z.object({
    action: z.literal("distribute"),
    element_ids: z.array(z.string()).min(3).describe("IDs of elements to distribute (>= 3)"),
    direction: z.enum(["horizontal", "vertical"]).describe("Distribution direction"),
  }),
]);

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
  op: Extract<Operation, { action: "move" }>,
): HandlerResult {
  const el = findElement(elements, op.element_id);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };
  el.x = op.x;
  el.y = op.y;
  bumpVersion(el);
  return { description: `moved ${shortLabel(el)} to (${op.x}, ${op.y})` };
}

function applyResize(
  elements: CanvasElement[],
  op: Extract<Operation, { action: "resize" }>,
): HandlerResult {
  const el = findElement(elements, op.element_id);
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
  op: Extract<Operation, { action: "delete" }>,
): HandlerResult {
  const el = findElement(elements, op.element_id);
  if (!el) return { description: `[skip] element ${op.element_id} not found` };
  el.isDeleted = true;
  bumpVersion(el);
  return { description: `deleted ${shortLabel(el)}` };
}

function applyUpdateStyle(
  elements: CanvasElement[],
  op: Extract<Operation, { action: "update_style" }>,
): HandlerResult {
  const el = findElement(elements, op.element_id);
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
  op: Extract<Operation, { action: "add_text" }>,
): HandlerResult {
  const id = generateId();
  const el: CanvasElement = {
    ...createElementBase(),
    id,
    type: "text",
    text: op.text,
    x: op.x,
    y: op.y,
    width: measureTextWidth(op.text, op.fontSize),
    height: op.fontSize * 1.25,
    fontSize: op.fontSize,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
    strokeColor: op.strokeColor,
    containerId: null,
    originalText: op.text,
    autoResize: true,
    lineHeight: 1.25,
  };
  elements.push(el);
  const short =
    op.text.length > 20 ? op.text.slice(0, 17) + "..." : op.text;
  return {
    description: `added text '${short}' at (${op.x}, ${op.y}) [id=${id}]`,
    createdId: id,
  };
}

function applyAddShape(
  elements: CanvasElement[],
  op: Extract<Operation, { action: "add_shape" }>,
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
    strokeColor: op.strokeColor,
    backgroundColor: op.backgroundColor,
    fillStyle: op.fillStyle,
  };

  if (op.label) {
    const textId = generateId();
    const fontSize = op.label.fontSize;
    const textWidth = measureTextWidth(op.label.text, fontSize);
    const textHeight = fontSize * 1.25;

    // Bind text to shape
    ensureBoundElements(el).push({ type: "text", id: textId });

    const textEl: CanvasElement = {
      ...createElementBase(),
      id: textId,
      type: "text",
      text: op.label.text,
      originalText: op.label.text,
      x: op.x + (op.width - textWidth) / 2,
      y: op.y + (op.height - textHeight) / 2,
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
  op: Extract<Operation, { action: "add_line" }>,
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
    type: op.line_type,
    x: originX,
    y: originY,
    width,
    height,
    points: excalidrawPoints,
    strokeColor: op.strokeColor,
    strokeWidth: op.strokeWidth,
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
  op: Extract<Operation, { action: "add_line" }>,
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
    strokeColor: op.strokeColor,
    strokeWidth: op.strokeWidth,
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
  op: Extract<Operation, { action: "reorder" }>,
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
  op: Extract<Operation, { action: "align" }>,
): HandlerResult {
  const targets = op.element_ids
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
  op: Extract<Operation, { action: "distribute" }>,
): HandlerResult {
  const targets = op.element_ids
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
