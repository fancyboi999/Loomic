import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import {
  wsCommandSchema,
  wsRpcResponseSchema,
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

  app.get("/api/ws", { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    // Auth: extract token from query
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token || !options.auth) {
      socket.close(4001, "Unauthorized");
      return;
    }

    // Authenticate asynchronously, close if invalid
    void authenticateAndBind(socket, token, request, options, agentRuns, connectionManager);
  });
}

async function authenticateAndBind(
  socket: WebSocket,
  token: string,
  _request: FastifyRequest,
  options: RegisterWsOptions,
  agentRuns: AgentRunService,
  connectionManager: ConnectionManager,
) {
  let userId: string;
  try {
    const fakeRequest = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as FastifyRequest;
    const user = await options.auth!.authenticate(fakeRequest);
    if (!user) {
      socket.close(4001, "Unauthorized");
      return;
    }
    userId = user.id;
  } catch {
    socket.close(4001, "Unauthorized");
    return;
  }

  // Socket may have closed during async auth
  if (socket.readyState !== 1) return;

  connectionManager.register(userId, socket);

  // Heartbeat with pong timeout (spec §1.3: 60s no-pong → disconnect)
  let lastPong = Date.now();
  socket.on("pong", () => { lastPong = Date.now(); });

  const pingInterval = setInterval(() => {
    if (Date.now() - lastPong > 60_000) {
      socket.terminate();
      return;
    }
    if (socket.readyState === 1) {
      socket.ping();
    }
  }, 30_000);

  socket.on("message", (raw: Buffer | string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf-8"));
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.type === "rpc.response") {
      try {
        const rpcResponse = wsRpcResponseSchema.parse(parsed);
        connectionManager.handleRpcResponse(userId, {
          type: rpcResponse.type,
          id: rpcResponse.id,
          ...(rpcResponse.result !== undefined ? { result: rpcResponse.result } : {}),
          ...(rpcResponse.error !== undefined ? { error: rpcResponse.error } : {}),
        });
      } catch {
        // Ignore malformed RPC responses
      }
      return;
    }

    if (obj.type === "command") {
      let msg;
      try {
        msg = wsCommandSchema.parse(parsed);
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid command format" }));
        return;
      }

      if (msg.action === "agent.run") {
        const p = msg.payload;
        void handleRunCommand(userId, {
          sessionId: p.sessionId,
          conversationId: p.conversationId,
          prompt: p.prompt,
          ...(p.canvasId !== undefined ? { canvasId: p.canvasId } : {}),
          ...(p.attachments !== undefined ? { attachments: p.attachments } : {}),
          ...(p.imageModel !== undefined ? { imageModel: p.imageModel } : {}),
        }, socket, agentRuns, connectionManager, token, options);
      } else if (msg.action === "agent.cancel") {
        const cancelResult = agentRuns.cancelRun(msg.payload.runId);
        if (!cancelResult) {
          socket.send(JSON.stringify({ type: "error", message: `Run not found: ${msg.payload.runId}` }));
        }
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
  services: RegisterWsOptions,
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
      threadId = sessionThread.threadId;
    } catch {
      // Fall through -- unauthenticated or missing session
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

  // Persist run metadata
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
