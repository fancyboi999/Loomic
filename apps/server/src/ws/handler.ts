import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";

import {
  type MessageMention,
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
import { createPipelineLogger } from "./logger.js";

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
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token || !options.auth) {
      socket.close(4001, "Unauthorized");
      return;
    }

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
  const log = createPipelineLogger("ws");

  let userId: string;
  try {
    const fakeRequest = {
      headers: { authorization: `Bearer ${token}` },
    } as unknown as FastifyRequest;
    const user = await options.auth!.authenticate(fakeRequest);
    if (!user) {
      log.warn("auth_rejected", { reason: "invalid_token" });
      socket.close(4001, "Unauthorized");
      return;
    }
    userId = user.id;
    log.info("connected", { userId });
  } catch (err) {
    log.warn("auth_error", { error: err instanceof Error ? err.message : String(err) });
    socket.close(4001, "Unauthorized");
    return;
  }

  if (socket.readyState !== 1) return;

  // Use client-provided connectionId for reconnect identity; fallback to server UUID
  const urlForParams = new URL(_request.url, `http://${_request.headers.host}`);
  const connectionId = urlForParams.searchParams.get("connectionId") || randomUUID();
  connectionManager.register(connectionId, userId, socket);

  // Heartbeat with pong timeout (spec §1.3: 60s no-pong → disconnect)
  let lastPong = Date.now();
  socket.on("pong", () => { lastPong = Date.now(); });

  const pingInterval = setInterval(() => {
    if (Date.now() - lastPong > 60_000) {
      log.warn("pong_timeout", { userId });
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
        connectionManager.handleRpcResponse(connectionId, {
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
        const runToken = p.accessToken ?? token;
        void handleRunCommand(userId, connectionId, {
          sessionId: p.sessionId,
          conversationId: p.conversationId,
          prompt: p.prompt,
          ...(p.canvasId !== undefined ? { canvasId: p.canvasId } : {}),
          ...(p.attachments !== undefined ? { attachments: p.attachments } : {}),
          ...(p.imageGenerationPreference !== undefined
            ? { imageGenerationPreference: p.imageGenerationPreference }
            : {}),
          ...(p.mentions !== undefined ? { mentions: p.mentions } : {}),
        }, agentRuns, connectionManager, runToken, options);
      } else if (msg.action === "agent.cancel") {
        log.info("run_cancel", { userId, runId: msg.payload.runId });
        const cancelResult = agentRuns.cancelRun(msg.payload.runId);
        if (!cancelResult) {
          socket.send(JSON.stringify({ type: "error", message: `Run not found: ${msg.payload.runId}` }));
        }
      }
    }
  });

  socket.on("close", () => {
    log.info("disconnected", { userId, connectionId });
    clearInterval(pingInterval);
    connectionManager.remove(connectionId);
  });

  socket.on("error", () => {
    log.error("socket_error", { userId, connectionId });
    clearInterval(pingInterval);
    connectionManager.remove(connectionId);
  });
}

async function handleRunCommand(
  userId: string,
  connectionId: string,
  payload: {
    sessionId: string;
    conversationId: string;
    prompt: string;
    canvasId?: string;
    attachments?: Array<{
      assetId: string;
      url: string;
      mimeType: string;
      name?: string;
    }>;
    imageGenerationPreference?: {
      mode: "auto" | "manual";
      models: string[];
    };
    mentions?: MessageMention[];
  },
  agentRuns: AgentRunService,
  connectionManager: ConnectionManager,
  accessToken: string,
  services: RegisterWsOptions,
) {
  const log = createPipelineLogger("agent.run", { userId, sessionId: payload.sessionId });
  log.info("started", { prompt: payload.prompt.slice(0, 80) });

  const authenticatedUser = { id: userId, accessToken, email: "", userMetadata: {} };

  // Resolve thread + model in parallel
  const [threadId, model] = await Promise.all([
    (async (): Promise<string | undefined> => {
      if (!services.threadService) return undefined;
      try {
        const sessionThread = await services.threadService.resolveOwnedSessionThread(
          authenticatedUser,
          payload.sessionId,
        );
        return sessionThread.threadId;
      } catch {
        return undefined;
      }
    })(),
    (async (): Promise<string | undefined> => {
      if (!services.settingsService || !services.viewerService) return undefined;
      try {
        const viewer = await services.viewerService.ensureViewer(authenticatedUser);
        const settings = await services.settingsService.getWorkspaceSettings(
          authenticatedUser,
          viewer.workspace.id,
        );
        return settings.defaultModel;
      } catch {
        return undefined;
      }
    })(),
  ]);
  log.lap("resolve", { threadId: !!threadId, model });

  const response = agentRuns.createRun(payload, {
    accessToken,
    userId,
    ...(model ? { model } : {}),
    ...(threadId ? { threadId } : {}),
  });
  const runId = response.runId;
  log.lap("run_created", { runId });

  // Persist run metadata
  if (threadId && services.agentRunMetadataService) {
    try {
      await services.agentRunMetadataService.createAcceptedRun({
        ...(model ? { model } : {}),
        runId,
        sessionId: payload.sessionId,
        threadId,
      });
    } catch {
      // Non-fatal
    }
  }

  // Bind this connection to the canvas so events route correctly
  const canvasId = payload.canvasId ?? payload.conversationId;
  connectionManager.bindCanvas(connectionId, canvasId);

  // Send ACK to the specific connection that initiated the run.
  // Retry with short delays if the connection is temporarily unavailable
  // (e.g., brief disconnect/reconnect during page transitions).
  const ackMessage = {
    type: "command.ack",
    action: "agent.run",
    payload: response,
  };
  let ackSent = connectionManager.sendTo(connectionId, ackMessage);
  if (!ackSent) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 500));
      ackSent = connectionManager.sendTo(connectionId, ackMessage);
      if (ackSent) break;
    }
  }
  log.lap("ack_sent", { runId, connectionId, delivered: ackSent });

  // Stream events to ALL connections viewing this canvas
  try {
    let firstEvent = true;
    for await (const event of agentRuns.streamRun(runId)) {
      if (firstEvent) {
        log.lap("first_token", { runId });
        firstEvent = false;
      }
      connectionManager.pushToCanvas(canvasId, event);
    }
    log.lap("stream_done", { runId });
  } catch (error) {
    log.error("stream_error", { runId, error: error instanceof Error ? error.message : "unknown" });
    connectionManager.pushToCanvas(canvasId, {
      type: "run.failed",
      runId,
      error: {
        code: "run_failed",
        message: error instanceof Error ? error.message : "Stream failed",
      },
      timestamp: new Date().toISOString(),
    });
  }
}
