import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../../src/ws/connection-manager.js";

function createMockWs() {
  return {
    send: vi.fn(),
    readyState: 1, // OPEN
    on: vi.fn(),
    close: vi.fn(),
  } as any;
}

describe("ConnectionManager", () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = new ConnectionManager();
  });

  afterEach(() => {
    cm.dispose();
  });

  it("registers and retrieves a connection", () => {
    const ws = createMockWs();
    cm.register("user-1", ws);
    expect(cm.get("user-1")).toBe(ws);
  });

  it("removes a connection", () => {
    const ws = createMockWs();
    cm.register("user-1", ws);
    cm.remove("user-1");
    expect(cm.get("user-1")).toBeUndefined();
  });

  it("replaces existing connection on re-register", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("user-1", ws1);
    cm.register("user-1", ws2);
    expect(cm.get("user-1")).toBe(ws2);
    expect(ws1.close).toHaveBeenCalled();
  });

  it("pushes event via ws.send as JSON", () => {
    const ws = createMockWs();
    cm.register("user-1", ws);
    const event = {
      type: "run.started" as const,
      runId: "r1",
      sessionId: "s1",
      conversationId: "c1",
      timestamp: "2026-03-27T00:00:00.000Z",
    };
    cm.push("user-1", event);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "event", event }),
    );
  });

  it("push does nothing if user not connected", () => {
    // Should not throw
    cm.push("nonexistent", {
      type: "run.started",
      runId: "r1",
      sessionId: "s1",
      conversationId: "c1",
      timestamp: "2026-03-27T00:00:00.000Z",
    } as any);
  });

  it("rpc resolves when client responds", async () => {
    const ws = createMockWs();
    cm.register("user-1", ws);

    const promise = cm.rpc("user-1", "canvas.screenshot", { mode: "full" });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");

    cm.handleRpcResponse("user-1", {
      type: "rpc.response",
      id: sent.id,
      result: { url: "https://example.com/img.png", width: 1024, height: 768 },
    });

    const result = await promise;
    expect(result).toEqual({
      url: "https://example.com/img.png",
      width: 1024,
      height: 768,
    });
  });

  it("rpc rejects on timeout", async () => {
    const ws = createMockWs();
    cm.register("user-1", ws);

    const promise = cm.rpc("user-1", "test.method", {}, 50);

    await expect(promise).rejects.toThrow("RPC timeout");
  });

  it("rpc rejects when client sends error", async () => {
    const ws = createMockWs();
    cm.register("user-1", ws);

    const promise = cm.rpc("user-1", "canvas.screenshot", { mode: "full" });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    cm.handleRpcResponse("user-1", {
      type: "rpc.response",
      id: sent.id,
      error: "exportToBlob failed",
    });

    await expect(promise).rejects.toThrow("exportToBlob failed");
  });

  it("rpc rejects immediately if user not connected", async () => {
    await expect(
      cm.rpc("nonexistent", "test", {}),
    ).rejects.toThrow("not connected");
  });
});
