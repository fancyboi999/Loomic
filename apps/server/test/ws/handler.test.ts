import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";

import { ConnectionManager } from "../../src/ws/connection-manager.js";
import { registerWsRoute } from "../../src/ws/handler.js";

describe("WebSocket handler", () => {
  it("rejects connection without token", async () => {
    const app = Fastify();
    await app.register(websocket);
    const cm = new ConnectionManager();

    await registerWsRoute(app, {
      agentRuns: { createRun: vi.fn(), cancelRun: vi.fn(), hasRun: vi.fn(), streamRun: vi.fn() } as any,
      auth: {
        authenticate: vi.fn().mockResolvedValue(null),
      } as any,
      connectionManager: cm,
    });

    await app.listen({ port: 0 });
    const port = (app.server.address() as any).port;

    const ws = new WebSocket(`ws://localhost:${port}/api/ws`);

    await new Promise<void>((resolve) => {
      ws.on("close", (code) => {
        expect(code).toBe(4001);
        resolve();
      });
    });

    await app.close();
    cm.dispose();
  });

  it("accepts connection and handles agent.run command", async () => {
    const app = Fastify();
    await app.register(websocket);
    const cm = new ConnectionManager();

    const mockUser = { id: "user-1", accessToken: "valid-token", email: "test@test.com", userMetadata: {} };
    const mockRunResponse = { runId: "run-1", sessionId: "s1", conversationId: "c1", status: "accepted" as const };

    await registerWsRoute(app, {
      agentRuns: {
        createRun: vi.fn().mockReturnValue(mockRunResponse),
        cancelRun: vi.fn(),
        hasRun: vi.fn().mockReturnValue(true),
        streamRun: vi.fn().mockImplementation(async function* () {
          yield { type: "run.completed", runId: "run-1", timestamp: "2026-03-27T00:00:00.000Z" };
        }),
      } as any,
      auth: {
        authenticate: vi.fn().mockResolvedValue(mockUser),
      } as any,
      connectionManager: cm,
    });

    await app.listen({ port: 0 });
    const port = (app.server.address() as any).port;

    const ws = new WebSocket(`ws://localhost:${port}/api/ws?token=valid-token`);

    const messages: any[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "command",
          action: "agent.run",
          payload: {
            sessionId: "s1",
            conversationId: "c1",
            prompt: "hello",
            canvasId: "canvas-1",
          },
        }));
      });

      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length >= 2) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
    });

    expect(messages[0].type).toBe("command.ack");
    expect(messages[0].payload.runId).toBe("run-1");
    expect(messages[1].type).toBe("event");
    expect(messages[1].event.type).toBe("run.completed");

    await app.close();
    cm.dispose();
  });
});
