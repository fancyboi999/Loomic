import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ConnectionManager } from "../../src/ws/connection-manager.js";

function createMockWs(readyState = 1) {
  return {
    send: vi.fn(),
    readyState,
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

  it("registers and retrieves a connection by connectionId", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    expect(cm.get("conn-1")).toBe(ws);
  });

  it("retrieves a connection by userId (backward compat)", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    expect(cm.getByUser("user-1")).toBe(ws);
  });

  it("removes a connection by connectionId", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    cm.remove("conn-1");
    expect(cm.get("conn-1")).toBeUndefined();
    expect(cm.getByUser("user-1")).toBeUndefined();
  });

  it("supports multiple connections per user", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("conn-1", "user-1", ws1);
    cm.register("conn-2", "user-1", ws2);

    expect(cm.get("conn-1")).toBe(ws1);
    expect(cm.get("conn-2")).toBe(ws2);
    // getByUser returns one of them
    const found = cm.getByUser("user-1");
    expect([ws1, ws2]).toContain(found);
  });

  it("replaces entry on reconnect with same connectionId", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("conn-1", "user-1", ws1);
    cm.register("conn-1", "user-1", ws2);
    expect(cm.get("conn-1")).toBe(ws2);
    // Old ws should NOT be force-closed (caller decides)
  });

  it("removing one connection does not affect others for same user", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("conn-1", "user-1", ws1);
    cm.register("conn-2", "user-1", ws2);
    cm.remove("conn-1");
    expect(cm.get("conn-1")).toBeUndefined();
    expect(cm.get("conn-2")).toBe(ws2);
    expect(cm.getByUser("user-1")).toBe(ws2);
  });

  // --- Canvas binding ---

  it("bindCanvas associates connection with a canvas", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    cm.bindCanvas("conn-1", "canvas-A");

    const event = {
      type: "run.started" as const,
      runId: "r1",
      sessionId: "s1",
      conversationId: "c1",
      timestamp: "2026-03-27T00:00:00.000Z",
    };
    cm.pushToCanvas("canvas-A", event);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "event", event }),
    );
  });

  it("bindCanvas moves connection between canvases", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    cm.bindCanvas("conn-1", "canvas-A");
    cm.bindCanvas("conn-1", "canvas-B");

    const event = {
      type: "run.started" as const,
      runId: "r1",
      sessionId: "s1",
      conversationId: "c1",
      timestamp: "2026-03-27T00:00:00.000Z",
    };

    // Should NOT receive events for old canvas
    cm.pushToCanvas("canvas-A", event);
    expect(ws.send).not.toHaveBeenCalled();

    // Should receive events for new canvas
    cm.pushToCanvas("canvas-B", event);
    expect(ws.send).toHaveBeenCalled();
  });

  // --- Push / Send ---

  it("pushToUser sends event to all user connections", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("conn-1", "user-1", ws1);
    cm.register("conn-2", "user-1", ws2);

    const event = {
      type: "run.started" as const,
      runId: "r1",
      sessionId: "s1",
      conversationId: "c1",
      timestamp: "2026-03-27T00:00:00.000Z",
    };
    cm.pushToUser("user-1", event);

    const expected = JSON.stringify({ type: "event", event });
    expect(ws1.send).toHaveBeenCalledWith(expected);
    expect(ws2.send).toHaveBeenCalledWith(expected);
  });

  it("push (backward compat) sends to all user connections", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
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

  it("sendTo sends to a specific connection", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    const ok = cm.sendTo("conn-1", { type: "hello" });
    expect(ok).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "hello" }));
  });

  it("sendToUser broadcasts to all user connections", () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    cm.register("conn-1", "user-1", ws1);
    cm.register("conn-2", "user-1", ws2);
    const ok = cm.sendToUser("user-1", { type: "hello" });
    expect(ok).toBe(true);
    const expected = JSON.stringify({ type: "hello" });
    expect(ws1.send).toHaveBeenCalledWith(expected);
    expect(ws2.send).toHaveBeenCalledWith(expected);
  });

  it("send (backward compat) delegates to sendToUser", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    const ok = cm.send("user-1", { type: "ack" });
    expect(ok).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ack" }));
  });

  it("skips closed connections when sending", () => {
    const ws = createMockWs(3); // CLOSED
    cm.register("conn-1", "user-1", ws);
    expect(cm.sendTo("conn-1", { type: "hello" })).toBe(false);
    expect(cm.sendToUser("user-1", { type: "hello" })).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("getByUser skips closed connections", () => {
    const wsClosed = createMockWs(3);
    const wsOpen = createMockWs(1);
    cm.register("conn-1", "user-1", wsClosed);
    cm.register("conn-2", "user-1", wsOpen);
    expect(cm.getByUser("user-1")).toBe(wsOpen);
  });

  // --- RPC ---

  it("rpc resolves when client responds (via userId backward compat)", async () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    // RPC uses userId fallback to find a connection
    const promise = cm.rpc("user-1", "canvas.screenshot", { mode: "full" });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");

    cm.handleRpcResponse("conn-1", {
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

  it("rpc works with connectionId directly", async () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    const promise = cm.rpc("conn-1", "canvas.screenshot", { mode: "full" });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");

    cm.handleRpcResponse("conn-1", {
      type: "rpc.response",
      id: sent.id,
      result: { ok: true },
    });

    expect(await promise).toEqual({ ok: true });
  });

  it("rpc rejects on timeout", async () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    const promise = cm.rpc("user-1", "test.method", {}, 50);

    await expect(promise).rejects.toThrow("RPC timeout");
  });

  it("rpc rejects when client sends error", async () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);

    const promise = cm.rpc("user-1", "canvas.screenshot", { mode: "full" });

    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    cm.handleRpcResponse("conn-1", {
      type: "rpc.response",
      id: sent.id,
      error: "exportToBlob failed",
    });

    await expect(promise).rejects.toThrow("exportToBlob failed");
  });

  it("rpc rejects immediately if not connected", async () => {
    await expect(
      cm.rpc("nonexistent", "test", {}),
    ).rejects.toThrow("not available");
  });

  // --- Dispose ---

  it("dispose cleans up all state", () => {
    const ws = createMockWs();
    cm.register("conn-1", "user-1", ws);
    cm.bindCanvas("conn-1", "canvas-A");
    cm.dispose();
    expect(cm.get("conn-1")).toBeUndefined();
    expect(cm.getByUser("user-1")).toBeUndefined();
  });
});
