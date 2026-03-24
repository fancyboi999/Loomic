import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  applicationErrorResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import { generateImage } from "../generation/image-generation.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const generateImageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
});

export async function registerGenerateRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
  },
) {
  app.post("/api/agent/generate-image", async (request, reply) => {
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

    let payload: z.infer<typeof generateImageRequestSchema>;
    try {
      payload = generateImageRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "invalid_request",
            message: "Invalid request body.",
          },
        }),
      );
    }

    try {
      const result = await generateImage("replicate", {
        prompt: payload.prompt,
        model: payload.model ?? "black-forest-labs/flux-kontext-pro",
        aspectRatio: payload.aspectRatio ?? "1:1",
      });

      return reply.code(200).send({
        url: result.url,
        prompt: payload.prompt,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image generation failed.";

      if (message.includes("No provider registered")) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "provider_not_configured",
              message: "Image generation is not available.",
            },
          }),
        );
      }

      return reply.code(502).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "generation_failed",
            message,
          },
        }),
      );
    }
  });
}
