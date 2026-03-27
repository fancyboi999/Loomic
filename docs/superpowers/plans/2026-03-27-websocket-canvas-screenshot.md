# WebSocket Migration + Canvas Screenshot Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SSE with WebSocket for all agent real-time communication and add a screenshot_canvas tool that gives the agent visual perception of the canvas.

**Architecture:** The existing AgentRunService async generator (`streamRun`) stays unchanged — only the transport layer changes from SSE to WebSocket. A new `ConnectionManager` manages WS connections and provides RPC capability for the screenshot tool. The screenshot tool sends an RPC request to the frontend, which uses Excalidraw's `exportToBlob` to capture and upload a screenshot, returning the URL to the agent as a multimodal ToolMessage.

**Tech Stack:** @fastify/websocket (server), native WebSocket API (browser), Excalidraw exportToBlob, Supabase Storage, LangChain ToolMessage with multimodal content blocks, Zod for protocol types, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-27-websocket-canvas-screenshot-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/shared/src/ws-protocol.ts` | Shared WS message type definitions (Zod schemas + TS types) |
| `apps/server/src/ws/connection-manager.ts` | WS connection registry, event push, RPC request/response with timeout |
| `apps/server/src/ws/handler.ts` | Fastify WS route, auth, message dispatch, command handling |
| `apps/server/src/agent/tools/screenshot-canvas.ts` | screenshot_canvas agent tool — sends RPC, returns multimodal ToolMessage |
| `apps/web/src/hooks/use-websocket.ts` | React hook: WS connection, auto-reconnect, event dispatch, RPC handler registry |
| `apps/server/test/ws/connection-manager.test.ts` | ConnectionManager unit tests |
| `apps/server/test/ws/handler.test.ts` | WS handler integration tests |
| `apps/server/test/screenshot-canvas.test.ts` | Screenshot tool unit tests |

### Modified Files
| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Add `export * from "./ws-protocol.js"` |
| `apps/server/package.json` | Add `@fastify/websocket` dependency |
| `apps/server/src/app.ts` | Register WS plugin + handler, remove `registerSseRoutes` |
| `apps/server/src/agent/tools/index.ts` | Add screenshot_canvas tool to `createMainAgentTools` |
| `apps/server/src/agent/deep-agent.ts` | Pass `ConnectionManager` to tool deps |
| `apps/server/src/agent/runtime.ts` | Accept `ConnectionManager` in options, pass to agent factory |
| `apps/server/src/agent/stream-adapter.ts` | Handle multimodal ToolMessage content in `extractArtifacts` |
| `apps/server/src/agent/prompts/loomic-main.ts` | Add screenshot_canvas usage guidance |
| `apps/web/src/components/chat-sidebar.tsx` | Replace `streamEvents()` + `createRun()` with WS-based flow |
| `apps/web/src/components/canvas-editor.tsx` | Register screenshot RPC handler |
| `apps/web/src/lib/server-api.ts` | Remove `createRun` (moved to WS command) |

### Deleted Files
| File | Reason |
|------|--------|
| `apps/server/src/http/sse.ts` | Replaced by WS handler |
| `apps/web/src/lib/stream-events.ts` | Replaced by useWebSocket hook |

---

## Task 1: Shared WebSocket Protocol Types

**Files:**
- Create: `packages/shared/src/ws-protocol.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
// packages/shared/src/ws-protocol.ts
import { z } from "zod";
import { streamEventSchema } from "./events.js";
import { runCreateRequestSchema, runCreateResponseSchema } from "./contracts.js";

// --- Server → Client: Push Event (replaces SSE) ---

export const wsServerEventSchema = z.object({
  type: z.literal("event"),
  event: streamEventSchema,
});

// --- Server → Client: RPC Request ---

export const wsRpcRequestSchema = z.object({
  type: z.literal("rpc.request"),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

// --- Server → Client: Command Ack ---

export const wsCommandAckSchema = z.object({
  type: z.literal("command.ack"),
  action: z.string().min(1),
  payload: z.record(z.unknown()),
});

// --- Client → Server: Command ---

export const wsRunCommandSchema = z.object({
  type: z.literal("command"),
  action: z.literal("agent.run"),
  payload: runCreateRequestSchema,
});

export const wsCancelCommandSchema = z.object({
  type: z.literal("command"),
  action: z.literal("agent.cancel"),
  payload: z.object({ runId: z.string().min(1) }),
});

export const wsCommandSchema = z.discriminatedUnion("action", [
  wsRunCommandSchema,
  wsCancelCommandSchema,
]);

// --- Client → Server: RPC Response ---

export const wsRpcResponseSchema = z.object({
  type: z.literal("rpc.response"),
  id: z.string().min(1),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

// --- Union: Client → Server ---

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  wsCommandSchema,
  wsRpcResponseSchema,
]);

// --- Union: Server → Client ---

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsServerEventSchema,
  wsRpcRequestSchema,
  wsCommandAckSchema,
]);

// --- Type exports ---

export type WsServerEvent = z.infer<typeof wsServerEventSchema>;
export type WsRpcRequest = z.infer<typeof wsRpcRequestSchema>;
export type WsCommandAck = z.infer<typeof wsCommandAckSchema>;
export type WsRunCommand = z.infer<typeof wsRunCommandSchema>;
export type WsCancelCommand = z.infer<typeof wsCancelCommandSchema>;
export type WsCommand = z.infer<typeof wsCommandSchema>;
export type WsRpcResponse = z.infer<typeof wsRpcResponseSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

// --- Screenshot-specific params/result ---

export const screenshotParamsSchema = z.object({
  mode: z.enum(["full", "region", "viewport"]),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  max_dimension: z.number().default(1024),
});

export const screenshotResultSchema = z.object({
  url: z.string().min(1),
  width: z.number(),
  height: z.number(),
});

export type ScreenshotParams = z.infer<typeof screenshotParamsSchema>;
export type ScreenshotResult = z.infer<typeof screenshotResultSchema>;
```

- [ ] **Step 2: Export from shared barrel**

Add to `packages/shared/src/index.ts`:

```typescript
export * from "./ws-protocol.js";
```

- [ ] **Step 3: Build shared package to verify no type errors**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter @loomic/shared build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ws-protocol.ts packages/shared/src/index.ts
git commit -m "feat: add shared WebSocket protocol type definitions"
```

---

## Task 2: ConnectionManager

**Files:**
- Create: `apps/server/src/ws/connection-manager.ts`
- Create: `apps/server/test/ws/connection-manager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/test/ws/connection-manager.test.ts
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

    // Extract the sent message to get the RPC id
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");

    // Simulate client response
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

    const promise = cm.rpc("user-1", "test.method", {}, 50); // 50ms timeout

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/ws/connection-manager.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ConnectionManager**

```typescript
// apps/server/src/ws/connection-manager.ts
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { StreamEvent } from "@loomic/shared";

type PendingRPC = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class ConnectionManager {
  private connections = new Map<string, WebSocket>();
  private pendingRPCs = new Map<string, PendingRPC>();

  register(userId: string, ws: WebSocket): void {
    const existing = this.connections.get(userId);
    if (existing && existing !== ws) {
      existing.close(1000, "replaced");
    }
    this.connections.set(userId, ws);
  }

  remove(userId: string): void {
    this.connections.delete(userId);
  }

  get(userId: string): WebSocket | undefined {
    return this.connections.get(userId);
  }

  push(userId: string, event: StreamEvent): void {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "event", event }));
  }

  async rpc<T = unknown>(
    userId: string,
    method: string,
    params: Record<string, unknown>,
    timeout = 10_000,
  ): Promise<T> {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`User ${userId} not connected`);
    }

    const id = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRPCs.delete(id);
        reject(new Error(`RPC timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this.pendingRPCs.set(id, { resolve, reject, timer });

      ws.send(
        JSON.stringify({
          type: "rpc.request",
          id,
          method,
          params,
        }),
      );
    });
  }

  handleRpcResponse(
    _userId: string,
    msg: { type: "rpc.response"; id: string; result?: unknown; error?: string },
  ): void {
    const pending = this.pendingRPCs.get(msg.id);
    if (!pending) return;

    this.pendingRPCs.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(new Error(msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  dispose(): void {
    for (const pending of this.pendingRPCs.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("ConnectionManager disposed"));
    }
    this.pendingRPCs.clear();
    this.connections.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/ws/connection-manager.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ws/connection-manager.ts apps/server/test/ws/connection-manager.test.ts
git commit -m "feat: add ConnectionManager for WebSocket connections and RPC"
```

---

## Task 3: WebSocket Route Handler + Server Integration

**Files:**
- Create: `apps/server/src/ws/handler.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/package.json` (add `@fastify/websocket`)

- [ ] **Step 1: Install @fastify/websocket**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server add @fastify/websocket`

- [ ] **Step 2: Create WS handler**

```typescript
// apps/server/src/ws/handler.ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import {
  wsCommandSchema,
  wsRpcResponseSchema,
  type WsClientMessage,
} from "@loomic/shared";
import type { AgentRunService } from "../agent/runtime.js";
import type { AgentRunMetadataService } from "../features/agent-runs/agent-run-service.js";
import type { ThreadService } from "../features/chat/thread-service.js";
import type { SettingsService } from "../features/settings/settings-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { RequestAuthenticator } from "../supabase/user.js";
import type { ConnectionManager } from "./connection-manager.js";

type RegisterWsOptions = {
  agentRuns: AgentRunService;
  agentRunMetadataService?: AgentRunMetadataService;
  auth?: RequestAuthenticator;
  connectionManager: ConnectionManager;
  settingsService?: SettingsService;
  threadService?: ThreadService;
  viewerService?: ViewerService;
};

export async function registerWsRoute(
  app: FastifyInstance,
  options: RegisterWsOptions,
) {
  const { agentRuns, connectionManager } = options;

  app.get("/api/ws", { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    // Auth: extract token from query
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token || !options.auth) {
      socket.close(4001, "Unauthorized");
      return;
    }

    let userId: string;
    try {
      // Build a minimal request-like object for the authenticator
      const fakeRequest = {
        headers: { authorization: `Bearer ${token}` },
      } as unknown as FastifyRequest;
      const user = await options.auth.authenticate(fakeRequest);
      if (!user) {
        socket.close(4001, "Unauthorized");
        return;
      }
      userId = user.id;
    } catch {
      socket.close(4001, "Unauthorized");
      return;
    }

    connectionManager.register(userId, socket);

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.ping();
      }
    }, 30_000);

    socket.on("message", (raw: Buffer | string) => {
      let msg: WsClientMessage;
      try {
        const parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));

        if (parsed.type === "rpc.response") {
          const rpcResponse = wsRpcResponseSchema.parse(parsed);
          connectionManager.handleRpcResponse(userId, rpcResponse);
          return;
        }

        if (parsed.type === "command") {
          msg = wsCommandSchema.parse(parsed);
        } else {
          return; // Unknown message type, ignore
        }
      } catch {
        socket.send(JSON.stringify({
          type: "error",
          message: "Invalid message format",
        }));
        return;
      }

      if (msg.action === "agent.run") {
        void handleRunCommand(userId, msg.payload, socket, agentRuns, connectionManager, token, options);
      } else if (msg.action === "agent.cancel") {
        const cancelResult = agentRuns.cancelRun(msg.payload.runId);
        if (!cancelResult) {
          socket.send(JSON.stringify({
            type: "error",
            message: `Run not found: ${msg.payload.runId}`,
          }));
        }
      }
    });

    socket.on("close", () => {
      clearInterval(pingInterval);
      connectionManager.remove(userId);
    });

    socket.on("error", () => {
      clearInterval(pingInterval);
      connectionManager.remove(userId);
    });
  });
}

async function handleRunCommand(
  userId: string,
  payload: {
    sessionId: string;
    conversationId: string;
    prompt: string;
    canvasId?: string;
    attachments?: Array<{ assetId: string; url: string; mimeType: string }>;
    imageModel?: string;
  },
  socket: WebSocket,
  agentRuns: AgentRunService,
  connectionManager: ConnectionManager,
  accessToken: string,
  services: {
    agentRunMetadataService?: AgentRunMetadataService;
    settingsService?: SettingsService;
    threadService?: ThreadService;
    viewerService?: ViewerService;
  },
) {
  const authenticatedUser = { id: userId, accessToken, email: "", userMetadata: {} };

  // Resolve session thread (same logic as runs.ts)
  let threadId: string | undefined;
  if (services.threadService) {
    try {
      const sessionThread = await services.threadService.resolveOwnedSessionThread(
        authenticatedUser,
        payload.sessionId,
      );
      threadId = sessionThread?.threadId;
    } catch {
      // Fall through
    }
  }

  // Resolve per-workspace model (same logic as runs.ts)
  let model: string | undefined;
  if (services.settingsService && services.viewerService) {
    try {
      const viewer = await services.viewerService.ensureViewer(authenticatedUser);
      const settings = await services.settingsService.getWorkspaceSettings(
        authenticatedUser,
        viewer.workspace.id,
      );
      model = settings.defaultModel;
    } catch {
      // Fall through to server default
    }
  }

  const response = agentRuns.createRun(payload, {
    accessToken,
    userId,
    ...(model ? { model } : {}),
    ...(payload.imageModel ? { imageModel: payload.imageModel } : {}),
    ...(threadId ? { threadId } : {}),
  });

  // Persist run metadata (same as runs.ts)
  if (threadId && services.agentRunMetadataService) {
    try {
      await services.agentRunMetadataService.createAcceptedRun({
        ...(model ? { model } : {}),
        runId: response.runId,
        sessionId: payload.sessionId,
        threadId,
      });
    } catch {
      // Non-fatal
    }
  }

  // Send ack
  socket.send(
    JSON.stringify({
      type: "command.ack",
      action: "agent.run",
      payload: response,
    }),
  );

  // Stream events via WS push
  try {
    for await (const event of agentRuns.streamRun(response.runId)) {
      connectionManager.push(userId, event);
    }
  } catch (error) {
    connectionManager.push(userId, {
      type: "run.failed",
      runId: response.runId,
      error: {
        code: "run_failed",
        message: error instanceof Error ? error.message : "Stream failed",
      },
      timestamp: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 3: Integrate into app.ts**

In `apps/server/src/app.ts`:

1. Add imports:
```typescript
import websocket from "@fastify/websocket";
import { ConnectionManager } from "./ws/connection-manager.js";
import { registerWsRoute } from "./ws/handler.js";
```

2. Before route registrations (after `const agentRuns = ...`), add:
```typescript
const connectionManager = new ConnectionManager();
```

3. Register WebSocket plugin (before routes):
```typescript
void app.register(websocket);
```

4. Replace `registerSseRoutes` with `registerWsRoute`:
```typescript
// Remove: void registerSseRoutes(app, agentRuns, env);
void registerWsRoute(app, {
  agentRuns,
  agentRunMetadataService,
  auth,
  connectionManager,
  settingsService,
  threadService,
  viewerService,
});
```

5. Remove the `registerSseRoutes` import.

6. Pass `connectionManager` through to `createAgentRunService` options (needed later for screenshot tool):
```typescript
const agentRuns = createAgentRunService({
  // ... existing options ...
  connectionManager,
});
```

- [ ] **Step 4: Update BuildAppOptions type to include connectionManager**

In `apps/server/src/app.ts`, add to `BuildAppOptions`:
```typescript
connectionManager?: ConnectionManager;
```

And use it:
```typescript
const connectionManager = options.connectionManager ?? new ConnectionManager();
```

- [ ] **Step 5: Verify server builds**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server build`
Expected: Build succeeds (may have unused import warnings, but no type errors)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ws/handler.ts apps/server/src/app.ts apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add WebSocket route handler and integrate into Fastify server"
```

---

## Task 4: Pass ConnectionManager to Agent Tools

**Files:**
- Modify: `apps/server/src/agent/runtime.ts`
- Modify: `apps/server/src/agent/deep-agent.ts`
- Modify: `apps/server/src/agent/tools/index.ts`

- [ ] **Step 1: Add connectionManager to runtime options**

In `apps/server/src/agent/runtime.ts`:

1. Import `ConnectionManager`:
```typescript
import type { ConnectionManager } from "../ws/connection-manager.js";
```

2. Add to `CreateAgentRuntimeOptions`:
```typescript
connectionManager?: ConnectionManager;
```

3. Pass `connectionManager` to the agent factory call inside `streamRun` (where `resolvedAgentFactory` is called, around line 358):
```typescript
agent = resolvedAgentFactory({
  // ... existing options ...
  ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
});
```

- [ ] **Step 2: Thread connectionManager through deep-agent.ts**

In `apps/server/src/agent/deep-agent.ts`:

1. Import `ConnectionManager`:
```typescript
import type { ConnectionManager } from "../ws/connection-manager.js";
```

2. Add to `LoomicAgentFactory` options type and `createLoomicDeepAgent` options:
```typescript
connectionManager?: ConnectionManager;
```

3. Pass to `createMainAgentTools` deps:
```typescript
tools: createMainAgentTools(backendFactory, {
  createUserClient,
  // ... existing deps ...
  ...(options.connectionManager ? { connectionManager: options.connectionManager } : {}),
}),
```

- [ ] **Step 3: Add connectionManager to tool deps in index.ts**

In `apps/server/src/agent/tools/index.ts`:

1. Import `ConnectionManager`:
```typescript
import type { ConnectionManager } from "../../ws/connection-manager.js";
```

2. Add to `createMainAgentTools` deps type:
```typescript
connectionManager?: ConnectionManager;
```

(The actual screenshot tool registration will be added in Task 7.)

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run`
Expected: All existing tests PASS (we only added optional fields)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/runtime.ts apps/server/src/agent/deep-agent.ts apps/server/src/agent/tools/index.ts
git commit -m "feat: thread ConnectionManager through agent factory to tool deps"
```

---

## Task 5: Screenshot Canvas Tool (Server)

**Files:**
- Create: `apps/server/src/agent/tools/screenshot-canvas.ts`
- Create: `apps/server/test/screenshot-canvas.test.ts`
- Modify: `apps/server/src/agent/tools/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/server/test/screenshot-canvas.test.ts
import { describe, expect, it, vi } from "vitest";

import { createScreenshotCanvasTool } from "../src/agent/tools/screenshot-canvas.js";
import { ConnectionManager } from "../src/ws/connection-manager.js";

function createMockWs() {
  return {
    send: vi.fn(),
    readyState: 1,
    on: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
  } as any;
}

describe("screenshot_canvas tool", () => {
  it("sends RPC request and returns multimodal ToolMessage content", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("user-1", ws);

    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    // Call the tool in background, then respond to the RPC
    const resultPromise = tool.invoke(
      { mode: "full", max_dimension: 1024 },
      { configurable: { access_token: "tok", canvas_id: "canvas-1" }, runnable_config: { userId: "user-1" } } as any,
    );

    // Wait for the send to happen
    await new Promise((r) => setTimeout(r, 50));

    // Extract RPC id from sent message
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("rpc.request");
    expect(sent.method).toBe("canvas.screenshot");
    expect(sent.params.mode).toBe("full");

    // Respond
    cm.handleRpcResponse("user-1", {
      type: "rpc.response",
      id: sent.id,
      result: { url: "https://storage.example.com/shot.png", width: 1024, height: 768 },
    });

    const result = await resultPromise;
    // The tool returns a string (LangChain tool convention), but we check it contains image info
    expect(result).toContain("screenshot");
    expect(result).toContain("1024");
  });

  it("returns error message when user not connected", async () => {
    const cm = new ConnectionManager();
    const tool = createScreenshotCanvasTool({ connectionManager: cm });

    const result = await tool.invoke(
      { mode: "full" },
      { configurable: { access_token: "tok", canvas_id: "c1" }, runnable_config: { userId: "user-1" } } as any,
    );

    expect(result).toContain("error");
    expect(result).toContain("not connected");
  });

  it("returns error message on RPC timeout", async () => {
    const cm = new ConnectionManager();
    const ws = createMockWs();
    cm.register("user-1", ws);

    const tool = createScreenshotCanvasTool({
      connectionManager: cm,
      rpcTimeout: 50,
    });

    const result = await tool.invoke(
      { mode: "full" },
      { configurable: { access_token: "tok", canvas_id: "c1" }, runnable_config: { userId: "user-1" } } as any,
    );

    expect(result).toContain("error");
    expect(result).toContain("timeout");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/screenshot-canvas.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement screenshot_canvas tool**

```typescript
// apps/server/src/agent/tools/screenshot-canvas.ts
import { tool } from "langchain";
import { z } from "zod";

import type { ConnectionManager } from "../../ws/connection-manager.js";
import type { ScreenshotResult } from "@loomic/shared";

const screenshotCanvasSchema = z.object({
  mode: z
    .enum(["full", "region", "viewport"])
    .describe("full: all elements; region: specific area; viewport: current user view"),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional()
    .describe("Required when mode is 'region'. Defines the crop rectangle."),
  max_dimension: z
    .number()
    .default(1024)
    .describe("Max width or height in pixels. 512=low, 1024=medium, 2048=high quality"),
});

export function createScreenshotCanvasTool(deps: {
  connectionManager: ConnectionManager;
  rpcTimeout?: number;
}) {
  const timeout = deps.rpcTimeout ?? 10_000;

  return tool(
    async (input, config) => {
      const userId = (config as any)?.runnable_config?.userId
        ?? (config as any)?.configurable?.user_id;

      if (!userId) {
        return JSON.stringify({
          error: "no_user_context",
          message: "screenshot_canvas requires a user context to communicate with the browser.",
        });
      }

      try {
        const result = await deps.connectionManager.rpc<ScreenshotResult>(
          userId,
          "canvas.screenshot",
          {
            mode: input.mode,
            ...(input.region ? { region: input.region } : {}),
            max_dimension: input.max_dimension,
          },
          timeout,
        );

        // Return structured JSON — the stream adapter will extract the image
        // artifact for frontend display. The model receives the full text
        // including the URL, which it can reference in conversation.
        return JSON.stringify({
          summary: `Canvas screenshot captured (${result.width}x${result.height}, mode: ${input.mode})`,
          screenshotUrl: result.url,
          width: result.width,
          height: result.height,
          mode: input.mode,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Screenshot failed";
        return JSON.stringify({
          error: "screenshot_failed",
          message: `Screenshot failed: ${message}`,
        });
      }
    },
    {
      name: "screenshot_canvas",
      description:
        "Take a visual screenshot of the canvas to inspect layout, design quality, color harmony, and spatial relationships. Use this to visually verify your changes or understand the current canvas state. Supports full canvas, specific region, or current viewport capture.",
      schema: screenshotCanvasSchema,
    },
  );
}
```

**Note on the ToolMessage approach:** The initial spec discussed returning a multimodal ToolMessage with image content blocks. However, after reviewing the codebase, the LangChain `tool()` helper returns string content. The approach here returns JSON with the screenshot URL. For the model to actually "see" the image, we need to modify how the tool result is injected into the conversation. This will be handled in Task 6 (stream adapter) by detecting screenshot results and injecting the image as a content block in the conversation state. **Alternatively**, we can override the tool to return a ToolMessage directly — this is the better approach and we'll implement it in Step 4.

- [ ] **Step 4: Update tool to return multimodal ToolMessage**

The `tool()` helper from LangChain returns string by default. To return a multimodal ToolMessage, we need to use `DynamicStructuredTool` or construct the ToolMessage ourselves. Update the implementation:

```typescript
// Replace the tool() call with DynamicStructuredTool for multimodal support
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";

export function createScreenshotCanvasTool(deps: {
  connectionManager: ConnectionManager;
  rpcTimeout?: number;
}) {
  const timeout = deps.rpcTimeout ?? 10_000;

  return new DynamicStructuredTool({
    name: "screenshot_canvas",
    description:
      "Take a visual screenshot of the canvas to inspect layout, design quality, color harmony, and spatial relationships. Use this to visually verify your changes or understand the current canvas state. Supports full canvas, specific region, or current viewport capture.",
    schema: screenshotCanvasSchema,
    func: async (input, _runManager, config) => {
      const userId = (config as any)?.configurable?.user_id;

      if (!userId) {
        return JSON.stringify({
          error: "no_user_context",
          message: "screenshot_canvas requires a user context to communicate with the browser.",
        });
      }

      try {
        const result = await deps.connectionManager.rpc<ScreenshotResult>(
          userId,
          "canvas.screenshot",
          {
            mode: input.mode,
            ...(input.region ? { region: input.region } : {}),
            max_dimension: input.max_dimension,
          },
          timeout,
        );

        return JSON.stringify({
          summary: `Canvas screenshot captured (${result.width}x${result.height}, mode: ${input.mode})`,
          screenshotUrl: result.url,
          width: result.width,
          height: result.height,
          mode: input.mode,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Screenshot failed";
        return JSON.stringify({
          error: "screenshot_failed",
          message: `Screenshot failed: ${message}`,
        });
      }
    },
  });
}
```

**Design note:** Returning the screenshot URL as JSON is pragmatic — the model sees the URL string and knows a screenshot was taken. For the model to actually *see* the image visually, the `configurable` must pass the image URL back into the conversation as a content block. This can be achieved at the agent graph level by post-processing tool results — but that requires deepagents framework changes. For v1, the model gets the URL and metadata, which is sufficient for many use cases. True multimodal tool result injection is a follow-up enhancement tracked separately.

- [ ] **Step 5: Register tool in index.ts**

In `apps/server/src/agent/tools/index.ts`:

1. Add import:
```typescript
import { createScreenshotCanvasTool } from "./screenshot-canvas.js";
```

2. Add to `createMainAgentTools` function, after the existing tools:
```typescript
if (deps.connectionManager) {
  tools.push(createScreenshotCanvasTool({ connectionManager: deps.connectionManager }));
}
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/screenshot-canvas.test.ts`
Expected: Tests pass (may need to adjust config passing based on actual LangChain behavior — fix as needed)

- [ ] **Step 7: Run all server tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/agent/tools/screenshot-canvas.ts apps/server/test/screenshot-canvas.test.ts apps/server/src/agent/tools/index.ts
git commit -m "feat: add screenshot_canvas tool with WebSocket RPC"
```

---

## Task 6: Stream Adapter Multimodal Support

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts`
- Modify: `apps/server/test/stream-adapter.test.ts`

- [ ] **Step 1: Add test for screenshot tool output extraction**

Append to `apps/server/test/stream-adapter.test.ts`:

```typescript
it("extracts screenshot artifact from tool output with screenshotUrl", async () => {
  const stream = makeStream([
    {
      event: "on_tool_start",
      name: "screenshot_canvas",
      data: { input: { mode: "full", max_dimension: 1024 } },
      run_id: "tool_screenshot_1",
    },
    {
      event: "on_tool_end",
      name: "screenshot_canvas",
      data: {
        output: new ToolMessage({
          content: JSON.stringify({
            summary: "Canvas screenshot captured (1024x768, mode: full)",
            screenshotUrl: "https://storage.example.com/screenshots/test.png",
            width: 1024,
            height: 768,
            mode: "full",
          }),
          name: "screenshot_canvas",
          tool_call_id: "tc_1",
        }),
      },
      run_id: "tool_screenshot_1",
    },
  ]);

  const events = await collectEvents(
    adaptDeepAgentStream({
      conversationId: "c1",
      now: () => "2026-03-27T00:00:00.000Z",
      runId: "run_1",
      sessionId: "s1",
      stream,
    }),
  );

  const completed = events.find(
    (e) => e.type === "tool.completed" && e.toolName === "screenshot_canvas",
  );
  expect(completed).toBeDefined();
  if (completed?.type === "tool.completed") {
    expect(completed.artifacts).toBeDefined();
    expect(completed.artifacts?.[0]?.type).toBe("image");
    expect(completed.artifacts?.[0]?.url).toBe(
      "https://storage.example.com/screenshots/test.png",
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/stream-adapter.test.ts`
Expected: The new test fails because `screenshotUrl` is not recognized as an artifact key

- [ ] **Step 3: Update extractArtifacts to handle screenshotUrl**

In `apps/server/src/agent/stream-adapter.ts`, add `screenshotUrl` handling in the `extractArtifacts` function. After the existing `imageUrl` block (around line 362-380):

```typescript
// Screenshot format: tool response with screenshotUrl
if (artifacts.length === 0 && typeof record.screenshotUrl === "string") {
  const candidate: Record<string, unknown> = {
    type: "image" as const,
    url: record.screenshotUrl,
    mimeType: "image/png",
    width: typeof record.width === "number" ? record.width : 1024,
    height: typeof record.height === "number" ? record.height : 1024,
  };
  const result = imageArtifactSchema.safeParse(candidate);
  if (result.success) {
    artifacts.push(result.data);
  }
}
```

Also add `"screenshotUrl"` to the `ARTIFACT_KEYS` set:
```typescript
const ARTIFACT_KEYS = new Set([
  "url",
  "imageUrl",
  "screenshotUrl",
  "mimeType",
  "width",
  "height",
  "placement",
]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/stream-adapter.test.ts`
Expected: All tests pass including the new screenshot test

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts apps/server/test/stream-adapter.test.ts
git commit -m "feat: support screenshotUrl artifact extraction in stream adapter"
```

---

## Task 7: Update System Prompt

**Files:**
- Modify: `apps/server/src/agent/prompts/loomic-main.ts`

- [ ] **Step 1: Add screenshot_canvas guidance to system prompt**

In `apps/server/src/agent/prompts/loomic-main.ts`, add after the existing tool usage strategy section (after line 13):

```typescript
// Add this section to LOOMIC_SYSTEM_PROMPT after "## 工具使用策略" section:
`
## 画布截图（视觉感知）
- **screenshot_canvas**: 截取画布的视觉截图，获得画布的实际渲染效果
  - mode="full": 截取所有元素的全景图
  - mode="region": 截取指定区域 (需传 region 参数)
  - mode="viewport": 截取用户当前视口
  - max_dimension: 控制截图分辨率，512=低/1024=中/2048=高
- **使用时机**:
  - 在复杂布局操作后，截图验证视觉效果
  - 用户询问画布外观、配色、布局美感时
  - 需要判断元素视觉重叠或间距是否合理时
- **注意**: inspect_canvas 看数据，screenshot_canvas 看画面。两者互补使用。`
```

- [ ] **Step 2: Run prompt test**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/loomic-prompt.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/prompts/loomic-main.ts
git commit -m "feat: add screenshot_canvas guidance to agent system prompt"
```

---

## Task 8: Frontend WebSocket Hook

**Files:**
- Create: `apps/web/src/hooks/use-websocket.ts`

- [ ] **Step 1: Implement useWebSocket hook**

```typescript
// apps/web/src/hooks/use-websocket.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  StreamEvent,
  WsCommandAck,
  WsRpcRequest,
  WsServerMessage,
  RunCreateRequest,
} from "@loomic/shared";

type EventCallback = (event: StreamEvent) => void;
type AckCallback = (ack: WsCommandAck) => void;
type RPCHandler = (params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export function useWebSocket(getToken: () => string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const eventListeners = useRef<Set<EventCallback>>(new Set());
  const ackListeners = useRef<Map<string, AckCallback>>(new Map()); // action → callback
  const rpcHandlers = useRef<Map<string, RPCHandler>>(new Map());

  const connect = useCallback(() => {
    const token = getToken();
    if (!token || disposed.current) return;

    const serverBase = process.env.NEXT_PUBLIC_SERVER_BASE_URL?.trim() || "http://localhost:3001";
    const wsUrl = serverBase.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "event") {
        for (const cb of eventListeners.current) {
          cb(msg.event);
        }
      } else if (msg.type === "command.ack") {
        const cb = ackListeners.current.get(msg.action);
        if (cb) cb(msg);
      } else if (msg.type === "rpc.request") {
        void handleRpcRequest(ws, msg as WsRpcRequest);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [getToken]);

  const scheduleReconnect = useCallback(() => {
    if (disposed.current) return;
    const delay = Math.min(30_000, 1000 * Math.pow(2, reconnectAttempt.current));
    reconnectAttempt.current++;
    reconnectTimer.current = setTimeout(connect, delay);
  }, [connect]);

  async function handleRpcRequest(ws: WebSocket, req: WsRpcRequest) {
    const handler = rpcHandlers.current.get(req.method);
    if (!handler) {
      ws.send(
        JSON.stringify({
          type: "rpc.response",
          id: req.id,
          error: `No handler for method: ${req.method}`,
        }),
      );
      return;
    }

    try {
      const result = await handler(req.params);
      ws.send(
        JSON.stringify({
          type: "rpc.response",
          id: req.id,
          result,
        }),
      );
    } catch (error) {
      ws.send(
        JSON.stringify({
          type: "rpc.response",
          id: req.id,
          error: error instanceof Error ? error.message : "RPC handler failed",
        }),
      );
    }
  }

  // Connect on mount
  useEffect(() => {
    disposed.current = false;
    connect();
    return () => {
      disposed.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const sendCommand = useCallback(
    (action: string, payload: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "command", action, payload }));
    },
    [],
  );

  const startRun = useCallback(
    (payload: RunCreateRequest, onAck?: (ack: WsCommandAck) => void) => {
      if (onAck) {
        ackListeners.current.set("agent.run", (ack) => {
          ackListeners.current.delete("agent.run");
          onAck(ack);
        });
      }
      sendCommand("agent.run", payload as unknown as Record<string, unknown>);
    },
    [sendCommand],
  );

  const cancelRun = useCallback(
    (runId: string) => {
      sendCommand("agent.cancel", { runId });
    },
    [sendCommand],
  );

  const onEvent = useCallback((cb: EventCallback) => {
    eventListeners.current.add(cb);
    return () => {
      eventListeners.current.delete(cb);
    };
  }, []);

  const registerRPC = useCallback((method: string, handler: RPCHandler) => {
    rpcHandlers.current.set(method, handler);
    return () => {
      rpcHandlers.current.delete(method);
    };
  }, []);

  return {
    connected,
    startRun,
    cancelRun,
    onEvent,
    registerRPC,
  };
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter web build`
Expected: Build succeeds (hook is not yet consumed, but should compile)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-websocket.ts
git commit -m "feat: add useWebSocket hook with auto-reconnect and RPC support"
```

---

## Task 9: Frontend Chat Sidebar Migration (SSE → WS)

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx`
- Modify: `apps/web/src/components/canvas-editor.tsx` (pass WS context down)

- [ ] **Step 1: Create WebSocket provider**

The `useWebSocket` hook should be instantiated once at a high level and shared. Create a context provider in the workspace layout or canvas-editor level. The simplest approach: lift `useWebSocket` into `canvas-editor.tsx` (which already holds the Excalidraw API) and pass the WS methods down to `ChatSidebar` via props.

In `apps/web/src/components/canvas-editor.tsx`, add:

```typescript
import { useWebSocket } from "../hooks/use-websocket";
```

Initialize the hook (with the accessToken):
```typescript
const getToken = useCallback(() => accessToken, [accessToken]);
const ws = useWebSocket(getToken);
```

Pass to `ChatSidebar`:
```typescript
<ChatSidebar
  // ... existing props ...
  ws={ws}
/>
```

- [ ] **Step 2: Update ChatSidebar to use WS instead of SSE**

In `apps/web/src/components/chat-sidebar.tsx`:

1. Remove imports:
```typescript
// Remove: import { createRun } from "../lib/server-api";
// Remove: import { streamEvents } from "../lib/stream-events";
```

2. Add WS prop to `ChatSidebarProps`:
```typescript
ws: {
  connected: boolean;
  startRun: (payload: any, onAck?: (ack: any) => void) => void;
  cancelRun: (runId: string) => void;
  onEvent: (cb: (event: StreamEvent) => void) => () => void;
};
```

3. Replace `handleSend` streaming logic. The current code (lines 443-482):
```typescript
// OLD:
const run = await createRun(payload, { accessToken: accessTokenRef.current });
for await (const event of streamEvents(run.runId)) {
  if (abortRef.current) break;
  handleStreamEvent(event, assistantId);
  // ...
}
```

Replace with:
```typescript
// NEW:
const runIdPromise = new Promise<string>((resolve) => {
  ws.startRun(
    {
      sessionId: currentSessionId,
      conversationId: canvasId,
      prompt: text,
      canvasId,
      ...(currentAttachments.length > 0 ? { attachments: currentAttachments } : {}),
      ...(activeImageModelRef.current ? { imageModel: activeImageModelRef.current } : {}),
    },
    (ack) => resolve(ack.payload.runId as string),
  );
});
clearAttachments();

const runId = await runIdPromise;

// Listen for events from this run
const cleanup = ws.onEvent((event) => {
  if (event.runId !== runId) return;
  if (abortRef.current) return;

  handleStreamEvent(event, assistantId);

  if (event.type === "tool.completed" && event.artifacts && onImageGenerated) {
    for (const artifact of event.artifacts) {
      if (artifact.type === "image" && artifact.placement) {
        onImageGenerated(artifact as ImageArtifact);
      }
    }
  }

  if (event.type === "canvas.sync" && onCanvasSync) {
    onCanvasSync();
  }

  // Terminal event — stop listening
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.canceled"
  ) {
    resolveStream();
  }
});

// Wait until terminal event
let resolveStream: () => void;
await new Promise<void>((r) => { resolveStream = r; });
cleanup();
```

4. Remove `import { createRun } from "../lib/server-api"` (only `createRun` — keep other server-api imports).

- [ ] **Step 3: Verify it builds**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter web build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx apps/web/src/components/canvas-editor.tsx
git commit -m "feat: migrate chat sidebar from SSE to WebSocket events"
```

---

## Task 10: Frontend Screenshot RPC Handler

**Files:**
- Modify: `apps/web/src/components/canvas-editor.tsx`

- [ ] **Step 1: Register screenshot RPC handler in canvas-editor**

In `canvas-editor.tsx`, after the `useWebSocket` hook initialization, register the screenshot handler:

```typescript
import { exportToBlob } from "@excalidraw/excalidraw";
import { createClient } from "@supabase/supabase-js";

// Inside the component, after excalidrawAPI is available:
useEffect(() => {
  if (!ws || !excalidrawAPI) return;

  const cleanup = ws.registerRPC("canvas.screenshot", async (params) => {
    const { mode, region, max_dimension = 1024 } = params as {
      mode: string;
      region?: { x: number; y: number; width: number; height: number };
      max_dimension?: number;
    };

    const allElements = excalidrawAPI.getSceneElements().filter((e: any) => !e.isDeleted);
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    let elements = allElements;

    if (mode === "region" && region) {
      elements = allElements.filter((el: any) => {
        const ex = el.x ?? 0;
        const ey = el.y ?? 0;
        const ew = el.width ?? 0;
        const eh = el.height ?? 0;
        return !(
          ex + ew < region.x ||
          ex > region.x + region.width ||
          ey + eh < region.y ||
          ey > region.y + region.height
        );
      });
    } else if (mode === "viewport") {
      const zoom = appState.zoom?.value ?? 1;
      const sx = -(appState.scrollX ?? 0);
      const sy = -(appState.scrollY ?? 0);
      const vw = (appState.width ?? 1920) / zoom;
      const vh = (appState.height ?? 1080) / zoom;
      elements = allElements.filter((el: any) => {
        const ex = el.x ?? 0;
        const ey = el.y ?? 0;
        const ew = el.width ?? 0;
        const eh = el.height ?? 0;
        return !(ex + ew < sx || ex > sx + vw || ey + eh < sy || ey > sy + vh);
      });
    }

    const blob = await exportToBlob({
      elements,
      appState: { ...appState, exportBackground: true },
      files,
      maxWidthOrHeight: max_dimension,
      mimeType: "image/png",
    });

    // Upload to Supabase Storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const path = `screenshots/${canvasId}/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("canvases")
      .upload(path, blob, { contentType: "image/png", upsert: false });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from("canvases").getPublicUrl(path);

    // Get dimensions from blob
    const bmp = await createImageBitmap(blob);
    const width = bmp.width;
    const height = bmp.height;
    bmp.close();

    return { url: urlData.publicUrl, width, height };
  });

  return cleanup;
}, [ws, excalidrawAPI, canvasId]);
```

- [ ] **Step 2: Verify it builds**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter web build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/canvas-editor.tsx
git commit -m "feat: register canvas screenshot RPC handler in canvas editor"
```

---

## Task 11: Cleanup — Remove SSE Files

**Files:**
- Delete: `apps/server/src/http/sse.ts`
- Delete: `apps/web/src/lib/stream-events.ts`
- Modify: `apps/server/src/app.ts` (remove dead import)
- Modify: `apps/web/src/lib/server-api.ts` (remove `createRun` if no longer used)

- [ ] **Step 1: Delete SSE server route**

```bash
rm apps/server/src/http/sse.ts
```

- [ ] **Step 2: Delete frontend stream-events helper**

```bash
rm apps/web/src/lib/stream-events.ts
```

- [ ] **Step 3: Clean up dead imports**

In `apps/server/src/app.ts`, remove:
```typescript
import { registerSseRoutes } from "./http/sse.js";
```

In `apps/web/src/lib/server-api.ts`, remove `createRun` function if it's no longer imported anywhere. Check with grep first.

In `apps/web/src/components/chat-sidebar.tsx`, ensure no remaining import of `streamEvents` or `createRun` from the old modules.

- [ ] **Step 4: Verify full builds**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server build && pnpm --filter web build
```
Expected: Both build successfully

- [ ] **Step 5: Run all server tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run`
Expected: All pass (SSE tests that reference sse.ts will fail — remove or update them)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove SSE infrastructure, replaced by WebSocket"
```

---

## Task 12: WS Handler Integration Test

**Files:**
- Create: `apps/server/test/ws/handler.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// apps/server/test/ws/handler.test.ts
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

    const address = await app.listen({ port: 0 });
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

  it("accepts connection with valid token and receives command.ack", async () => {
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

    const address = await app.listen({ port: 0 });
    const port = (app.server.address() as any).port;

    const ws = new WebSocket(`ws://localhost:${port}/api/ws?token=valid-token`);

    const messages: any[] = [];
    await new Promise<void>((resolve) => {
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
        // Expect: command.ack + event(run.completed)
        if (messages.length >= 2) {
          ws.close();
          resolve();
        }
      });
    });

    expect(messages[0].type).toBe("command.ack");
    expect(messages[0].payload.runId).toBe("run-1");
    expect(messages[1].type).toBe("event");
    expect(messages[1].event.type).toBe("run.completed");

    await app.close();
    cm.dispose();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run apps/server/test/ws/handler.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/ws/handler.test.ts
git commit -m "test: add WebSocket handler integration tests"
```

---

## Task 13: Pass userId Through Agent Run Pipeline

**Files:**
- Modify: `apps/server/src/agent/runtime.ts`
- Modify: `apps/server/src/ws/handler.ts`

The screenshot tool needs `userId` in the LangChain configurable to identify which WS connection to send the RPC to. Currently the runtime passes `access_token` and `canvas_id` — we need to add `user_id`.

- [ ] **Step 1: Add userId to configurable in runtime.ts**

In `apps/server/src/agent/runtime.ts`, around line 399-407 where `configurable` is built:

```typescript
configurable: {
  ...(run.threadId ? { thread_id: run.threadId } : {}),
  ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
  ...(run.accessToken ? { access_token: run.accessToken } : {}),
  ...(run.userId ? { user_id: run.userId } : {}),  // NEW
},
```

- [ ] **Step 2: Pass userId in WS handler run command**

In `apps/server/src/ws/handler.ts`, the `handleRunCommand` function already receives `userId`. Ensure it's passed to `createRun`:

```typescript
const response = agentRuns.createRun(payload, {
  accessToken,
  userId,  // Already there
  ...(payload.imageModel ? { imageModel: payload.imageModel } : {}),
});
```

- [ ] **Step 3: Verify screenshot tool can read userId from config**

The screenshot tool reads `(config as any)?.configurable?.user_id` — this now works because runtime passes `user_id` in configurable.

- [ ] **Step 4: Run all tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm --filter server test -- --run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/runtime.ts apps/server/src/ws/handler.ts
git commit -m "feat: pass userId through agent configurable for screenshot RPC routing"
```

---

## Task 14: E2E Smoke Verification

- [ ] **Step 1: Start dev environment**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm dev`

- [ ] **Step 2: Open browser, verify WS connection**

Open browser dev tools → Network → WS tab. Navigate to a project canvas. Verify:
- WS connection to `/api/ws?token=...` is established
- Connection stays open (no rapid reconnect loops)

- [ ] **Step 3: Test chat via WS**

Send a message in the chat sidebar. Verify:
- `command.ack` received with runId
- Stream events received via WS (message.delta, tool.started, etc.)
- Chat UI renders correctly (same as before)

- [ ] **Step 4: Test screenshot tool**

Send: "截图看看画布现在什么样"

The agent should call `screenshot_canvas` tool. Verify:
- RPC request received in browser (check WS messages in Network tab)
- Screenshot captured and uploaded
- RPC response sent back
- Agent describes the canvas based on the screenshot result

- [ ] **Step 5: Test reconnection**

Temporarily kill the server and restart. Verify:
- Browser WS reconnects automatically
- Subsequent chat messages work normally

---

## Summary

| Task | Description | Dependencies |
|------|------------|-------------|
| 1 | Shared WS protocol types | None |
| 2 | ConnectionManager | Task 1 |
| 3 | WS route handler + server integration | Task 2 |
| 4 | Thread ConnectionManager to tools | Task 3 |
| 5 | Screenshot canvas tool (server) | Task 2, 4 |
| 6 | Stream adapter multimodal support | Task 5 |
| 7 | Update system prompt | Task 5 |
| 8 | Frontend useWebSocket hook | Task 1 |
| 9 | Chat sidebar SSE → WS migration | Task 8 |
| 10 | Frontend screenshot RPC handler | Task 8, 9 |
| 11 | Cleanup: remove SSE files | Task 9 |
| 12 | WS handler integration test | Task 3 |
| 13 | Pass userId through pipeline | Task 5 |
| 14 | E2E smoke verification | All |
