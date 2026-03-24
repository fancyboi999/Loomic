import { describe, expect, it } from "vitest";
import { createInspectCanvasTool } from "../src/agent/tools/inspect-canvas.js";

function createMockUserClient(canvasContent: Record<string, unknown> | null) {
  return (_accessToken: string) => ({
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () =>
            canvasContent
              ? { data: { content: canvasContent }, error: null }
              : { data: null, error: { code: "PGRST116" } },
        }),
      }),
    }),
  });
}

describe("inspect_canvas tool", () => {
  it("returns summary with element count and bounding box", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient({
        elements: [
          { id: "e1", type: "image", x: 100, y: 200, width: 512, height: 512, isDeleted: false },
          { id: "e2", type: "text", x: 100, y: 750, width: 200, height: 48, isDeleted: false, text: "COFFEE", fontSize: 48 },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
      }) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "canvas-1", access_token: "token-1" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.canvasId).toBe("canvas-1");
    expect(parsed.elementCount).toBe(2);
    expect(parsed.elements).toHaveLength(2);
    expect(parsed.elements[0]).toMatchObject({
      id: "e1",
      type: "image",
      x: 100,
      y: 200,
      width: 512,
      height: 512,
    });
    expect(parsed.boundingBox).toBeDefined();
  });

  it("returns error when no canvas context", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient(null) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: {} },
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("no_canvas_context");
  });

  it("returns error when canvas not found", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient(null) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "missing", access_token: "token" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("canvas_not_found");
  });

  it("filters out deleted elements", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient({
        elements: [
          { id: "e1", type: "image", x: 0, y: 0, width: 100, height: 100, isDeleted: false },
          { id: "e2", type: "image", x: 50, y: 50, width: 100, height: 100, isDeleted: true },
        ],
        appState: {},
      }) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "c1", access_token: "t1" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.elementCount).toBe(1);
  });
});
