import { tool } from "langchain";
import { z } from "zod";

const inspectCanvasSchema = z.object({
  detail_level: z
    .enum(["summary", "full"])
    .default("summary")
    .describe("Level of detail: summary (id, type, position, size) or full (all properties)"),
  element_id: z
    .string()
    .optional()
    .describe("Query a specific element by ID"),
  filter_type: z
    .array(z.string())
    .optional()
    .describe("Filter by element type(s), e.g. ['text', 'image', 'rectangle']"),
  filter_region: z
    .object({
      min_x: z.number(),
      min_y: z.number(),
      max_x: z.number(),
      max_y: z.number(),
    })
    .optional()
    .describe("Filter to elements within a bounding box region"),
});

type CanvasElement = Record<string, unknown>;

const DEFAULT_STROKE_COLOR = "#1e1e1e";
const DEFAULT_BACKGROUND_COLOR = "transparent";
const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

function summarizeElement(el: CanvasElement) {
  const base: Record<string, unknown> = {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };

  if (el.type === "text" && typeof el.text === "string") {
    base.text = el.text.length > 50 ? el.text.slice(0, 47) + "..." : el.text;
    base.fontSize = el.fontSize;
  }

  if (el.type === "image") {
    const customData = el.customData as Record<string, unknown> | undefined;
    if (customData?.title) {
      base.title = customData.title;
    }
  }

  if (SHAPE_TYPES.has(el.type as string)) {
    if (el.strokeColor && el.strokeColor !== DEFAULT_STROKE_COLOR) {
      base.strokeColor = el.strokeColor;
    }
    if (el.backgroundColor && el.backgroundColor !== DEFAULT_BACKGROUND_COLOR) {
      base.backgroundColor = el.backgroundColor;
    }
  }

  const groupIds = el.groupIds as unknown[] | undefined;
  if (Array.isArray(groupIds) && groupIds.length > 0) {
    base.grouped = true;
  }

  return base;
}

function computeBoundingBox(elements: CanvasElement[]) {
  if (elements.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    const w = Number(el.width) || 0;
    const h = Number(el.height) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  return { minX, minY, maxX, maxY };
}

export function createInspectCanvasTool(deps: {
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

      const elements = (content.elements ?? []).filter(
        (el) => !el.isDeleted,
      );

      if (input.element_id) {
        const found = elements.find((el) => el.id === input.element_id);
        if (!found) {
          return JSON.stringify({
            error: "element_not_found",
            message: `Element ${input.element_id} not found on canvas.`,
          });
        }
        return JSON.stringify(
          input.detail_level === "full" ? found : summarizeElement(found),
        );
      }

      // Apply optional filters
      let filtered = elements;

      if (input.filter_type && input.filter_type.length > 0) {
        filtered = filtered.filter((el) =>
          input.filter_type!.includes(el.type as string),
        );
      }

      if (input.filter_region) {
        const r = input.filter_region;
        filtered = filtered.filter((el) => {
          const ex = Number(el.x) || 0;
          const ey = Number(el.y) || 0;
          const ew = Number(el.width) || 0;
          const eh = Number(el.height) || 0;
          // Element overlaps region if it's not completely outside
          return !(ex + ew < r.min_x || ex > r.max_x || ey + eh < r.min_y || ey > r.max_y);
        });
      }

      const summaryElements =
        input.detail_level === "full"
          ? filtered
          : filtered.map(summarizeElement);

      return JSON.stringify({
        canvasId,
        elementCount: elements.length,
        matchedCount: filtered.length,
        boundingBox: computeBoundingBox(filtered),
        viewport: {
          backgroundColor:
            (content.appState as any)?.viewBackgroundColor ?? "#ffffff",
        },
        elements: summaryElements,
      });
    },
    {
      name: "inspect_canvas",
      description:
        "Inspect the current canvas state. Returns element positions, sizes, and types. Use before placing new elements to avoid overlaps. Set detail_level='full' for complete properties, or query a specific element_id. Use filter_type to narrow by element type(s) and filter_region to narrow by spatial area.",
      schema: inspectCanvasSchema,
    },
  );
}
