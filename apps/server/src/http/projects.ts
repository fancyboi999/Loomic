import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  projectCreateRequestSchema,
  projectCreateResponseSchema,
  projectListResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  ProjectServiceError,
  type ProjectService,
} from "../features/projects/project-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerProjectRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    projectService: ProjectService;
  },
) {
  app.get("/api/projects", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          }),
        );
      }

      const projects = await options.projectService.listProjects(user);
      return reply.code(200).send(projectListResponseSchema.parse({ projects }));
    } catch (error) {
      return sendProjectError(error, reply, "project_query_failed");
    }
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          }),
        );
      }

      const { projectId } = request.params as { projectId: string };
      await options.projectService.archiveProject(user, projectId);
      return reply.code(204).send();
    } catch (error) {
      return sendProjectError(error, reply, "application_error");
    }
  });

  app.post("/api/projects", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          }),
        );
      }

      const payload = projectCreateRequestSchema.parse(request.body);
      const project = await options.projectService.createProject(user, payload);

      return reply.code(201).send(
        projectCreateResponseSchema.parse({
          project,
        }),
      );
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      return sendProjectError(error, reply, "project_create_failed");
    }
  });
}

function sendProjectError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode: "application_error" | "project_create_failed" | "project_query_failed",
) {
  if (error instanceof ProjectServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: fallbackCode,
        message:
          fallbackCode === "project_query_failed"
            ? "Unable to load projects."
            : "Unable to create project.",
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
