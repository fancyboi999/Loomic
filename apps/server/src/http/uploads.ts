import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  assetSignedUrlResponseSchema,
  unauthenticatedErrorResponseSchema,
  uploadResponseSchema,
} from "@loomic/shared";

import {
  UploadServiceError,
  type UploadService,
} from "../features/uploads/upload-service.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function registerUploadRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    uploadService: UploadService;
    viewerService: ViewerService;
  },
) {
  // Upload a file
  app.post("/api/uploads", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthorized(reply);

      const file = await request.file();
      if (!file) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "upload_failed",
              message: "No file provided.",
            },
          }),
        );
      }

      const mimeType = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "upload_failed",
              message: `Unsupported file type: ${mimeType}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
            },
          }),
        );
      }

      const fileBuffer = await file.toBuffer();

      // Resolve workspace from viewer
      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;

      // Extract projectId from fields if provided
      const projectId =
        typeof file.fields.projectId === "object" &&
        file.fields.projectId !== null &&
        "value" in file.fields.projectId
          ? String(file.fields.projectId.value)
          : undefined;

      const result = await options.uploadService.uploadFile(user, {
        bucket: "project-assets",
        fileName: file.filename,
        fileBuffer,
        mimeType,
        workspaceId,
        ...(projectId ? { projectId } : {}),
      });

      return reply
        .code(201)
        .send(uploadResponseSchema.parse(result));
    } catch (error) {
      return sendUploadError(error, reply);
    }
  });

  // Get signed URL for an asset
  app.get<{ Params: { assetId: string } }>(
    "/api/uploads/:assetId/url",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const signedUrl = await options.uploadService.getSignedUrl(
          user,
          request.params.assetId,
        );

        return reply
          .code(200)
          .send(assetSignedUrlResponseSchema.parse({ signedUrl }));
      } catch (error) {
        return sendUploadError(error, reply);
      }
    },
  );

  // Delete an asset
  app.delete<{ Params: { assetId: string } }>(
    "/api/uploads/:assetId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        await options.uploadService.deleteAsset(
          user,
          request.params.assetId,
        );

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendUploadError(error, reply);
      }
    },
  );
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

function sendUploadError(error: unknown, reply: FastifyReply) {
  if (error instanceof UploadServiceError) {
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
        code: "application_error",
        message: "Internal server error.",
      },
    }),
  );
}
