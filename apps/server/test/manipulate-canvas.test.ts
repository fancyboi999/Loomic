import { describe, expect, it } from "vitest";
import { createManipulateCanvasTool, measureTextWidth } from "../src/agent/tools/manipulate-canvas.js";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

function createMockDeps(canvasContent: Record<string, unknown> | null) {
  let savedContent: any = null;
  return {
    deps: {
      createUserClient: (_accessToken: string) => ({
        from: (_table: string) => ({
          select: (_columns: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () =>
                canvasContent
                  ? { data: { content: canvasContent }, error: null }
                  : { data: null, error: { code: "PGRST116" } },
            }),
          }),
          update: (content: any) => ({
            eq: (_col: string, _val: string) => {
              savedContent = content;
              return { error: null };
            },
          }),
        }),
      }),
    },
    getSavedContent: () => savedContent,
  };
}

const CONFIG = {
  configurable: { canvas_id: "canvas-1", access_token: "token-1" },
};

function parseResult(result: string) {
  return JSON.parse(result) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// measureTextWidth
// ---------------------------------------------------------------------------

describe("measureTextWidth", () => {
  it("calculates Latin text width at 0.6x fontSize", () => {
    expect(measureTextWidth("hello", 20)).toBeCloseTo(60, 1);
  });

  it("calculates CJK text width at 1.0x fontSize", () => {
    expect(measureTextWidth("你好世界", 20)).toBeCloseTo(80, 1);
  });

  it("calculates mixed CJK + Latin text width", () => {
    // "Hello" = 5 × 12 = 60, "你好" = 2 × 20 = 40 → 100
    expect(measureTextWidth("Hello你好", 20)).toBeCloseTo(100, 1);
  });

  it("handles empty string", () => {
    expect(measureTextWidth("", 20)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe("manipulate_canvas tool", () => {
  it("returns error when no canvas context", async () => {
    const { deps } = createMockDeps(null);
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        { operations: [{ action: "delete", element_id: "x" }] },
        { configurable: {} },
      ),
    );
    expect(result.error).toBe("no_canvas_context");
  });

  it("applies move operation", async () => {
    const { deps, getSavedContent } = createMockDeps({
      elements: [
        { id: "e1", type: "rectangle", x: 0, y: 0, width: 100, height: 50, isDeleted: false, version: 1 },
      ],
    });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        { operations: [{ action: "move", element_id: "e1", x: 200, y: 300 }] },
        CONFIG,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.applied).toBe(1);

    const saved = getSavedContent();
    const el = (saved.content.elements as any[])[0];
    expect(el.x).toBe(200);
    expect(el.y).toBe(300);
  });

  it("skips operations on missing elements", async () => {
    const { deps } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        { operations: [{ action: "delete", element_id: "nonexistent" }] },
        CONFIG,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// add_text with CJK-aware width
// ---------------------------------------------------------------------------

describe("add_text with CJK width", () => {
  it("creates text element with correct CJK width", async () => {
    const { deps, getSavedContent } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            { action: "add_text", text: "你好世界", x: 10, y: 20, fontSize: 20 },
          ],
        },
        CONFIG,
      ),
    );
    expect(result.success).toBe(true);
    expect(result.createdIds).toBeDefined();

    const saved = getSavedContent();
    const el = (saved.content.elements as any[])[0];
    expect(el.type).toBe("text");
    expect(el.width).toBeCloseTo(80, 1); // 4 CJK chars × 20
    expect(el.height).toBeCloseTo(25, 1); // 20 × 1.25
  });
});

// ---------------------------------------------------------------------------
// add_shape with label (P0)
// ---------------------------------------------------------------------------

describe("add_shape with label", () => {
  it("creates shape + bound text when label provided", async () => {
    const { deps, getSavedContent } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_shape",
              shape: "rectangle",
              x: 100,
              y: 100,
              width: 160,
              height: 60,
              label: { text: "处理请求", fontSize: 20 },
            },
          ],
        },
        CONFIG,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.summary as string)).toContain("with label");

    const saved = getSavedContent();
    const elements = saved.content.elements as any[];
    expect(elements).toHaveLength(2); // shape + text

    const shape = elements[0];
    const text = elements[1];

    // Shape has boundElements referencing text
    expect(shape.type).toBe("rectangle");
    expect(shape.boundElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", id: text.id }),
      ]),
    );

    // Text is bound to shape
    expect(text.type).toBe("text");
    expect(text.containerId).toBe(shape.id);
    expect(text.textAlign).toBe("center");
    expect(text.verticalAlign).toBe("middle");
    expect(text.text).toBe("处理请求");

    // Text is centered inside shape
    const textWidth = measureTextWidth("处理请求", 20);
    expect(text.x).toBeCloseTo(100 + (160 - textWidth) / 2, 1);
    expect(text.y).toBeCloseTo(100 + (60 - 25) / 2, 1);
  });

  it("creates shape without label when label not provided", async () => {
    const { deps, getSavedContent } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    await tool.invoke(
      {
        operations: [
          {
            action: "add_shape",
            shape: "ellipse",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        ],
      },
      CONFIG,
    );

    const saved = getSavedContent();
    const elements = saved.content.elements as any[];
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("ellipse");
  });

  it("returns createdId for the shape", async () => {
    const { deps } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_shape",
              shape: "rectangle",
              x: 0,
              y: 0,
              width: 100,
              height: 50,
              label: { text: "A" },
            },
          ],
        },
        CONFIG,
      ),
    );

    const ids = result.createdIds as Record<string, string>;
    expect(ids).toBeDefined();
    expect(ids.op_0).toBeDefined();
    expect(typeof ids.op_0).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Arrow binding (P1)
// ---------------------------------------------------------------------------

describe("add_line with element binding", () => {
  it("creates bound arrow between two shapes", async () => {
    const shapeA = {
      id: "shape-a",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 160,
      height: 60,
      isDeleted: false,
      version: 1,
      boundElements: [],
    };
    const shapeB = {
      id: "shape-b",
      type: "rectangle",
      x: 100,
      y: 300,
      width: 160,
      height: 60,
      isDeleted: false,
      version: 1,
      boundElements: [],
    };

    const { deps, getSavedContent } = createMockDeps({
      elements: [shapeA, shapeB],
    });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_line",
              line_type: "arrow",
              start_element_id: "shape-a",
              end_element_id: "shape-b",
            },
          ],
        },
        CONFIG,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.applied).toBe(1);
    expect((result.summary as string)).toContain("bound arrow");

    const saved = getSavedContent();
    const elements = saved.content.elements as any[];
    expect(elements).toHaveLength(3); // 2 shapes + 1 arrow

    const arrow = elements[2];
    expect(arrow.type).toBe("arrow");
    expect(arrow.startBinding).toBeDefined();
    expect(arrow.startBinding.elementId).toBe("shape-a");
    expect(arrow.endBinding).toBeDefined();
    expect(arrow.endBinding.elementId).toBe("shape-b");
    expect(arrow.endArrowhead).toBe("arrow");

    // Source and target shapes should have boundElements updated
    const savedA = elements[0];
    const savedB = elements[1];
    expect(savedA.boundElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "arrow", id: arrow.id }),
      ]),
    );
    expect(savedB.boundElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "arrow", id: arrow.id }),
      ]),
    );
  });

  it("skips when start element not found", async () => {
    const { deps } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_line",
              line_type: "arrow",
              start_element_id: "missing",
              end_element_id: "also-missing",
            },
          ],
        },
        CONFIG,
      ),
    );

    expect(result.applied).toBe(0);
    expect(result.errors).toBeDefined();
  });

  it("still works with non-binding add_line", async () => {
    const { deps, getSavedContent } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_line",
              line_type: "arrow",
              x: 0,
              y: 0,
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ],
            },
          ],
        },
        CONFIG,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.applied).toBe(1);

    const saved = getSavedContent();
    const arrow = (saved.content.elements as any[])[0];
    expect(arrow.type).toBe("arrow");
    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Align (P4)
// ---------------------------------------------------------------------------

describe("align operation", () => {
  function threeBoxes() {
    return {
      elements: [
        { id: "a", type: "rectangle", x: 50, y: 10, width: 100, height: 40, isDeleted: false, version: 1 },
        { id: "b", type: "rectangle", x: 150, y: 50, width: 100, height: 40, isDeleted: false, version: 1 },
        { id: "c", type: "rectangle", x: 250, y: 90, width: 100, height: 40, isDeleted: false, version: 1 },
      ],
    };
  }

  it("aligns elements left", async () => {
    const { deps, getSavedContent } = createMockDeps(threeBoxes());
    const tool = createManipulateCanvasTool(deps);
    await tool.invoke(
      {
        operations: [
          { action: "align", element_ids: ["a", "b", "c"], alignment: "left" },
        ],
      },
      CONFIG,
    );

    const saved = getSavedContent();
    const els = saved.content.elements as any[];
    expect(els[0].x).toBe(50);
    expect(els[1].x).toBe(50);
    expect(els[2].x).toBe(50);
  });

  it("aligns elements center", async () => {
    const { deps, getSavedContent } = createMockDeps(threeBoxes());
    const tool = createManipulateCanvasTool(deps);
    await tool.invoke(
      {
        operations: [
          { action: "align", element_ids: ["a", "b", "c"], alignment: "center" },
        ],
      },
      CONFIG,
    );

    const saved = getSavedContent();
    const els = saved.content.elements as any[];
    // Centers: 50+50=100, 150+50=200, 250+50=300 → avg = 200
    // All should be centered at x=200 → x = 200 - width/2 = 200 - 50 = 150
    // All widths = 100, so all x = avg_center - 50 = 150
    expect(els[0].x).toBe(150);
    expect(els[1].x).toBe(150);
    expect(els[2].x).toBe(150);
  });

  it("aligns elements top", async () => {
    const { deps, getSavedContent } = createMockDeps(threeBoxes());
    const tool = createManipulateCanvasTool(deps);
    await tool.invoke(
      {
        operations: [
          { action: "align", element_ids: ["a", "b", "c"], alignment: "top" },
        ],
      },
      CONFIG,
    );

    const saved = getSavedContent();
    const els = saved.content.elements as any[];
    expect(els[0].y).toBe(10);
    expect(els[1].y).toBe(10);
    expect(els[2].y).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Distribute (P4)
// ---------------------------------------------------------------------------

describe("distribute operation", () => {
  it("distributes elements horizontally with equal gaps", async () => {
    const { deps, getSavedContent } = createMockDeps({
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 40, isDeleted: false, version: 1 },
        { id: "b", type: "rectangle", x: 80, y: 0, width: 50, height: 40, isDeleted: false, version: 1 },
        { id: "c", type: "rectangle", x: 200, y: 0, width: 50, height: 40, isDeleted: false, version: 1 },
      ],
    });
    const tool = createManipulateCanvasTool(deps);
    await tool.invoke(
      {
        operations: [
          {
            action: "distribute",
            element_ids: ["a", "b", "c"],
            direction: "horizontal",
          },
        ],
      },
      CONFIG,
    );

    const saved = getSavedContent();
    const els = saved.content.elements as any[];
    // Total span = 200 + 50 - 0 = 250
    // Total widths = 50 + 50 + 50 = 150
    // Gap = (250 - 150) / 2 = 50
    expect(els[0].x).toBe(0);
    expect(els[1].x).toBeCloseTo(100, 1); // 0 + 50 + 50
    expect(els[2].x).toBeCloseTo(200, 1); // 100 + 50 + 50
  });

  it("skips with fewer than 3 elements", async () => {
    const { deps } = createMockDeps({
      elements: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 40, isDeleted: false, version: 1 },
      ],
    });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "distribute",
              element_ids: ["a", "nonexistent", "also-missing"],
              direction: "horizontal",
            },
          ],
        },
        CONFIG,
      ),
    );
    expect(result.applied).toBe(0);
    expect(result.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// createdIds propagation
// ---------------------------------------------------------------------------

describe("createdIds in response", () => {
  it("includes IDs for all created elements", async () => {
    const { deps } = createMockDeps({ elements: [] });
    const tool = createManipulateCanvasTool(deps);
    const result = parseResult(
      await tool.invoke(
        {
          operations: [
            {
              action: "add_shape",
              shape: "rectangle",
              x: 0,
              y: 0,
              width: 100,
              height: 50,
              label: { text: "A" },
            },
            {
              action: "add_shape",
              shape: "rectangle",
              x: 0,
              y: 200,
              width: 100,
              height: 50,
              label: { text: "B" },
            },
            { action: "add_text", text: "Title", x: 0, y: -50, fontSize: 24 },
          ],
        },
        CONFIG,
      ),
    );

    const ids = result.createdIds as Record<string, string>;
    expect(ids.op_0).toBeDefined();
    expect(ids.op_1).toBeDefined();
    expect(ids.op_2).toBeDefined();
    // All IDs should be unique
    const values = Object.values(ids);
    expect(new Set(values).size).toBe(values.length);
  });
});
