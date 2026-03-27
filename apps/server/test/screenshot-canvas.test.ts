import { describe, expect, it, vi } from "vitest";
import { ConnectionManager } from "../src/ws/connection-manager.js";
import { createScreenshotCanvasTool } from "../src/agent/tools/screenshot-canvas.js";

function createMockWs() {
  return { send: vi.fn(), readyState: 1, on: vi.fn(), close: vi.fn(), ping: vi.fn() } as any;
}

describe("screenshot_canvas tool", () => {
  it("sends RPC and returns screenshot result", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("user-1", ws);

    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const resultPromise = tool.invoke(
      { mode: "full", max_dimension: 1024 },
      { configurable: { user_id: "user-1" } } as any,
    );

    // Wait for send
    await new Promise((r) => setTimeout(r, 50));

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");
    expect(sent.params.mode).toBe("full");

    cm.handleRpcResponse("user-1", {
      type: "rpc.response",
      id: sent.id,
      result: { url: "https://storage.example.com/shot.png", width: 1024, height: 768 },
    });

    const result = await resultPromise;
    const parsed = JSON.parse(result);
    expect(parsed.screenshotUrl).toBe("https://storage.example.com/shot.png");
    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(768);

    cm.dispose();
  });

  it("returns error when user not connected", async () => {
    const cm = new ConnectionManager();
    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const result = await tool.invoke(
      { mode: "full" },
      { configurable: { user_id: "user-1" } } as any,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("screenshot_failed");
    expect(parsed.message).toContain("not connected");

    cm.dispose();
  });

  it("returns error on timeout", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("user-1", ws);

    const tool = createScreenshotCanvasTool({ connectionManager: cm, rpcTimeout: 50 });

    const result = await tool.invoke(
      { mode: "full" },
      { configurable: { user_id: "user-1" } } as any,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("screenshot_failed");
    expect(parsed.message).toContain("timeout");

    cm.dispose();
  });

  it("returns error when no user context", async () => {
    const cm = new ConnectionManager();
    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const result = await tool.invoke(
      { mode: "full" },
      { configurable: {} } as any,
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("no_user_context");

    cm.dispose();
  });
});
