import type { FastifyInstance, FastifyReply } from "fastify";

import {
  runCancelResponseSchema,
  runCreateRequestSchema,
  runCreateResponseSchema,
} from "@loomic/shared";

import type { AgentRunService } from "../agent/runtime.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { SettingsService } from "../features/settings/settings-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerRunRoutes(
  app: FastifyInstance,
  agentRuns: AgentRunService,
  options?: {
    auth?: RequestAuthenticator;
    settingsService?: SettingsService;
    viewerService?: ViewerService;
  },
) {
  app.post("/api/agent/runs", async (request, reply) => {
    try {
      const payload = runCreateRequestSchema.parse(request.body);

      // Resolve per-workspace model if auth context is available
      let model: string | undefined;
      if (options?.auth && options.settingsService && options.viewerService) {
        try {
          const user = await options.auth.authenticate(request);
          if (user) {
            const viewer = await options.viewerService.ensureViewer(user);
            const settings =
              await options.settingsService.getWorkspaceSettings(
                user,
                viewer.workspace.id,
              );
            model = settings.defaultModel;
          }
        } catch {
          // Fall through to server default model if settings lookup fails
        }
      }

      const response = runCreateResponseSchema.parse(
        agentRuns.createRun(payload, model ? { model } : undefined),
      );

      return reply.code(202).send(response);
    } catch (error) {
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
