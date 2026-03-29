import { describe, expect, it, vi } from "vitest";
import { ConnectionManager } from "../src/ws/connection-manager.js";
import { createScreenshotCanvasTool } from "../src/agent/tools/screenshot-canvas.js";

function createMockWs() {
  return { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn(), ping: vi.fn() } as any;
}

/** Helper: invoke the tool as a ToolCall (mirrors agent runtime behaviour). */
function invokeAsToolCall(
  tool: ReturnType<typeof createScreenshotCanvasTool>,
  args: Record<string, unknown>,
  userId?: string,
) {
  return tool.invoke(
    { name: "screenshot_canvas", args, id: "call-1", type: "tool_call" as const },
    { configurable: { user_id: userId } } as any,
  );
}

describe("screenshot_canvas tool", () => {
  it("sends RPC and returns multimodal content with image", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const resultPromise = invokeAsToolCall(tool, { mode: "full", max_dimension: 1024 }, "user-1");

    await new Promise((r) => setTimeout(r, 50));

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");
    expect(sent.params.mode).toBe("full");

    cm.handleRpcResponse("user-1", {
      type: "rpc.response",
      id: sent.id,
      result: { url: "data:image/png;base64,iVBOR...", width: 1024, height: 768 },
    });

    const result = await resultPromise;
    expect(result.content).toEqual([
      { type: "text", text: "Canvas screenshot captured (1024x768, mode: full)" },
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBOR..." } },
    ]);

    cm.dispose();
  });

  it("returns error when user not connected", async () => {
    const cm = new ConnectionManager();
    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const result = await invokeAsToolCall(tool, { mode: "full" }, "user-1");

    const parsed = JSON.parse(result.content as string);
    expect(parsed.error).toBe("screenshot_failed");
    expect(parsed.message).toContain("not available");

    cm.dispose();
  });

  it("returns error on timeout", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    const tool = createScreenshotCanvasTool({ connectionManager: cm, rpcTimeout: 50 });

    const result = await invokeAsToolCall(tool, { mode: "full" }, "user-1");

    const parsed = JSON.parse(result.content as string);
    expect(parsed.error).toBe("screenshot_failed");
    expect(parsed.message).toContain("timeout");

    cm.dispose();
  });

  it("returns error when no user context", async () => {
    const cm = new ConnectionManager();
    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const result = await invokeAsToolCall(tool, { mode: "full" }, undefined);

    const parsed = JSON.parse(result.content as string);
    expect(parsed.error).toBe("no_user_context");

    cm.dispose();
  });
});
