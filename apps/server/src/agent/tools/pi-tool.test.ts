import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createTool } from "./pi-tool.js";

describe("Pi business tool binding", () => {
  it("validates model input, applies defaults, and binds server context", async () => {
    const run = vi.fn(async (input: { count: number }, config: { configurable: { canvas_id?: string } }) => ({
      count: input.count,
      canvasId: config.configurable.canvas_id,
    }));
    const tool = createTool({ canvas_id: "canvas-1" })(run, {
      name: "test_tool",
      description: "Test tool",
      schema: z.object({ count: z.number().default(1) }),
    });

    expect((tool.parameters as { required?: string[] }).required ?? []).not.toContain("count");
    const result = await tool.execute("call-1", {}, new AbortController().signal);
    expect(result.content).toEqual([{ type: "text", text: '{"count":1,"canvasId":"canvas-1"}' }]);
    expect(run).toHaveBeenCalledWith({ count: 1 }, { configurable: { canvas_id: "canvas-1" } });
    await expect(tool.execute("call-2", { count: "invalid" }, new AbortController().signal)).rejects.toThrow();
    expect(run).toHaveBeenCalledOnce();
  });
});
