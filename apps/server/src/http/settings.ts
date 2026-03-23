import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  unauthenticatedErrorResponseSchema,
  workspaceSettingsResponseSchema,
  workspaceSettingsUpdateRequestSchema,
} from "@loomic/shared";

import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import {
  SettingsServiceError,
  type SettingsService,
} from "../features/settings/settings-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerSettingsRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    settingsService: SettingsService;
    viewerService: ViewerService;
  },
) {
  app.get("/api/workspace/settings", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthorized(reply);

      const viewer = await options.viewerService.ensureViewer(user);
      const settings = await options.settingsService.getWorkspaceSettings(
        user,
        viewer.workspace.id,
      );

      return reply
        .code(200)
        .send(workspaceSettingsResponseSchema.parse({ settings }));
    } catch (error) {
      return sendSettingsError(error, reply);
    }
  });

  app.put("/api/workspace/settings", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthorized(reply);

      const payload = workspaceSettingsUpdateRequestSchema.parse(request.body);
      const viewer = await options.viewerService.ensureViewer(user);
      const settings = await options.settingsService.updateWorkspaceSettings(
        user,
        viewer.workspace.id,
        payload,
      );

      return reply
        .code(200)
        .send(workspaceSettingsResponseSchema.parse({ settings }));
    } catch (error) {
      return sendSettingsError(error, reply);
    }
  });
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

function sendSettingsError(error: unknown, reply: FastifyReply) {
  if (error instanceof SettingsServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  if (isZodError(error)) {
    return reply.code(400).send({
      issues: error.issues,
      message: "Invalid request body",
    });
  }

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "application_error",
        message: "Internal server error.",
      },
    }),
  );
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
