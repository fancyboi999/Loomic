import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  runCancelResponseSchema,
  runCreateRequestSchema,
  runCreateResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import type { AgentRunService } from "../agent/runtime.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import {
  AgentRunPersistenceError,
  type AgentRunMetadataService,
} from "../features/agent-runs/agent-run-service.js";
import {
  ThreadServiceError,
  type ThreadService,
} from "../features/chat/thread-service.js";
import type { SettingsService } from "../features/settings/settings-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerRunRoutes(
  app: FastifyInstance,
  agentRuns: AgentRunService,
  options: {
    agentRunMetadataService?: AgentRunMetadataService;
    auth?: RequestAuthenticator;
    settingsService?: SettingsService;
    threadService?: ThreadService;
    viewerService?: ViewerService;
  } = {},
) {
  app.post("/api/agent/runs", async (request, reply) => {
    try {
      const payload = runCreateRequestSchema.parse(request.body);
      const hasAuthorization = hasBearerAuthorization(
        request.headers.authorization,
      );
      const authenticatedUser =
        hasAuthorization && options?.auth
          ? await options.auth.authenticate(request)
          : null;

      if (hasAuthorization && !authenticatedUser) {
        return sendUnauthorized(reply);
      }

      const sessionThread =
        authenticatedUser && options?.threadService
          ? await options.threadService.resolveOwnedSessionThread(
              authenticatedUser,
              payload.sessionId,
            )
          : null;

      // Resolve per-workspace model if auth context is available
      let model: string | undefined;
      if (
        authenticatedUser &&
        options.settingsService &&
        options.viewerService
      ) {
        try {
          const viewer =
            await options.viewerService.ensureViewer(authenticatedUser);
          const settings = await options.settingsService.getWorkspaceSettings(
            authenticatedUser,
            viewer.workspace.id,
          );
          model = settings.defaultModel;
        } catch {
          // Fall through to server default model if settings lookup fails
        }
      }

      const response = runCreateResponseSchema.parse(
        agentRuns.createRun(payload, {
          ...(authenticatedUser ? { accessToken: authenticatedUser.accessToken, userId: authenticatedUser.id } : {}),
          ...(model ? { model } : {}),
          ...(sessionThread ? { threadId: sessionThread.threadId } : {}),
        }),
      );

      if (sessionThread && options.agentRunMetadataService) {
        await options.agentRunMetadataService.createAcceptedRun({
          ...(model ? { model } : {}),
          runId: response.runId,
          sessionId: payload.sessionId,
          threadId: sessionThread.threadId,
        });
      }

      return reply.code(202).send(response);
    } catch (error) {
      if (error instanceof ThreadServiceError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: error.code,
              message: error.message,
            },
          }),
        );
      }

      if (error instanceof AgentRunPersistenceError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: error.code,
              message: error.message,
            },
          }),
        );
      }

      return handleZodError(error, reply);
    }
  });

  app.post("/api/agent/runs/:runId/cancel", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const canceledRun = agentRuns.cancelRun(runId);

    if (!canceledRun) {
      return reply.code(404).send({
        message: `Run not found: ${runId}`,
      });
    }

    const response = runCancelResponseSchema.parse(canceledRun);
    return reply.code(202).send(response);
  });
}

function hasBearerAuthorization(
  authorizationHeader: string | string[] | undefined,
) {
  return typeof authorizationHeader === "string"
    ? authorizationHeader.trim().toLowerCase().startsWith("bearer ")
    : false;
}

function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    }),
  );
}

function handleZodError(error: unknown, reply: FastifyReply) {
  if (isZodError(error)) {
    return reply.code(400).send({
      issues: error.issues,
      message: "Invalid request body",
    });
  }

  throw error;
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
