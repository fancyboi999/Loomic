import { tool } from "langchain";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

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
  }),
  z.object({
    action: z.literal("add_line"),
    line_type: z.enum(["line", "arrow"]).default("line").describe("Line or arrow"),
    points: z
      .array(z.tuple([z.number(), z.number()]))
      .min(2)
      .describe("Array of [x, y] points"),
    x: z.number().describe("Starting x offset"),
    y: z.number().describe("Starting y offset"),
    strokeColor: z.string().default("#000000").describe("Stroke color hex"),
    strokeWidth: z.number().default(1).describe("Stroke width"),
  }),
  z.object({
    action: z.literal("reorder"),
    element_id: z.string().describe("ID of element to reorder"),
    position: z.enum(["front", "back"]).describe("Bring to front or send to back"),
  }),
]);

const manipulateCanvasSchema = z.object({
  operations: z.array(operationSchema).min(1).describe("List of operations to apply"),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CanvasElement = Record<string, unknown>;
type Operation = z.infer<typeof operationSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
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

function label(el: CanvasElement): string {
  if (el.type === "text" && typeof el.text === "string") {
    const short = el.text.length > 20 ? el.text.slice(0, 17) + "..." : el.text;
    return `text '${short}'`;
  }
  return `${el.type ?? "element"}(${el.id})`;
}

// ---------------------------------------------------------------------------
// Operation handlers — each returns a human-readable description
// ---------------------------------------------------------------------------

function applyMove(elements: CanvasElement[], op: Extract<Operation, { action: "move" }>): string {
  const el = findElement(elements, op.element_id);
  if (!el) return `[skip] element ${op.element_id} not found`;
  el.x = op.x;
  el.y = op.y;
  bumpVersion(el);
  return `moved ${label(el)} to (${op.x}, ${op.y})`;
}

function applyResize(elements: CanvasElement[], op: Extract<Operation, { action: "resize" }>): string {
  const el = findElement(elements, op.element_id);
  if (!el) return `[skip] element ${op.element_id} not found`;
  el.width = op.width;
  el.height = op.height;
  bumpVersion(el);
  return `resized ${label(el)} to ${op.width}x${op.height}`;
}

function applyDelete(elements: CanvasElement[], op: Extract<Operation, { action: "delete" }>): string {
  const el = findElement(elements, op.element_id);
  if (!el) return `[skip] element ${op.element_id} not found`;
  el.isDeleted = true;
  bumpVersion(el);
  return `deleted ${label(el)}`;
}

function applyUpdateStyle(elements: CanvasElement[], op: Extract<Operation, { action: "update_style" }>): string {
  const el = findElement(elements, op.element_id);
  if (!el) return `[skip] element ${op.element_id} not found`;

  const applied: string[] = [];
  const props = ["strokeColor", "backgroundColor", "opacity", "fontSize", "strokeWidth"] as const;
  for (const key of props) {
    if (op[key] !== undefined) {
      el[key] = op[key];
      applied.push(key);
    }
  }
  bumpVersion(el);
  return `updated ${label(el)} style: ${applied.join(", ")}`;
}

function applyAddText(elements: CanvasElement[], op: Extract<Operation, { action: "add_text" }>): string {
  const el: CanvasElement = {
    ...createElementBase(),
    type: "text",
    text: op.text,
    x: op.x,
    y: op.y,
    width: op.text.length * op.fontSize * 0.6,
    height: op.fontSize * 1.2,
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
  return `added text '${op.text.length > 20 ? op.text.slice(0, 17) + "..." : op.text}' at (${op.x}, ${op.y})`;
}

function applyAddShape(elements: CanvasElement[], op: Extract<Operation, { action: "add_shape" }>): string {
  const el: CanvasElement = {
    ...createElementBase(),
    type: op.shape,
    x: op.x,
    y: op.y,
    width: op.width,
    height: op.height,
    strokeColor: op.strokeColor,
    backgroundColor: op.backgroundColor,
    fillStyle: op.fillStyle,
  };
  elements.push(el);
  return `added ${op.shape} ${op.width}x${op.height} at (${op.x}, ${op.y})`;
}

function applyAddLine(elements: CanvasElement[], op: Extract<Operation, { action: "add_line" }>): string {
  const xs = op.points.map((p) => p[0]);
  const ys = op.points.map((p) => p[1]);
  const width = Math.abs(Math.max(...xs) - Math.min(...xs));
  const height = Math.abs(Math.max(...ys) - Math.min(...ys));

  const el: CanvasElement = {
    ...createElementBase(),
    type: op.line_type,
    x: op.x,
    y: op.y,
    width,
    height,
    points: op.points,
    strokeColor: op.strokeColor,
    strokeWidth: op.strokeWidth,
    lastCommittedPoint: op.points[op.points.length - 1],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: op.line_type === "arrow" ? "arrow" : null,
  };
  elements.push(el);
  return `added ${op.line_type} with ${op.points.length} points at (${op.x}, ${op.y})`;
}

function applyReorder(elements: CanvasElement[], op: Extract<Operation, { action: "reorder" }>): string {
  const idx = elements.findIndex((el) => el.id === op.element_id && !el.isDeleted);
  if (idx === -1) return `[skip] element ${op.element_id} not found`;

  const removed = elements.splice(idx, 1);
  const el = removed[0]!;
  if (op.position === "front") {
    elements.push(el);
  } else {
    elements.unshift(el);
  }
  bumpVersion(el);
  return `reordered ${label(el)} to ${op.position}`;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const handlers: Record<
  Operation["action"],
  (elements: CanvasElement[], op: any) => string
> = {
  move: applyMove,
  resize: applyResize,
  delete: applyDelete,
  update_style: applyUpdateStyle,
  add_text: applyAddText,
  add_shape: applyAddShape,
  add_line: applyAddLine,
  reorder: applyReorder,
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

      for (const op of input.operations) {
        try {
          const handler = handlers[op.action];
          const desc = handler(elements, op);
          if (desc.startsWith("[skip]")) {
            errors.push(desc);
          } else {
            descriptions.push(desc);
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
      if (errors.length > 0) {
        result.errors = errors;
      }
      return JSON.stringify(result);
    },
    {
      name: "manipulate_canvas",
      description:
        "Manipulate elements on the canvas. Supports: move, resize, delete, update_style, add_text, add_shape, add_line, reorder. Use inspect_canvas first to understand the current layout. Returns a summary of applied operations.",
      schema: manipulateCanvasSchema,
    },
  );
}
