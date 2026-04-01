import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  applicationErrorResponseSchema,
  getPlanConfig,
  unauthenticatedErrorResponseSchema,
  type ImageQualityLevel,
} from "@loomic/shared";

import { generateImage } from "../generation/image-generation.js";
import { resolveImageProviderName } from "../generation/providers/registry.js";
import type { CreditService } from "../features/credits/credit-service.js";
import { CreditServiceError } from "../features/credits/credit-service.js";
import type { TierGuard } from "../features/credits/tier-guard.js";
import { TierGuardError } from "../features/credits/tier-guard.js";
import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type { UploadService } from "../features/uploads/upload-service.js";
import type { AuthenticatedUser, RequestAuthenticator } from "../supabase/user.js";

const generateImageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
});

export async function registerGenerateRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    creditService?: CreditService;
    tierGuard?: TierGuard;
    uploadService: UploadService;
    viewerService: ViewerService;
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

    const model = payload.model ?? "black-forest-labs/flux-kontext-pro";

    try {
      // ── Tier guard + credit checks ──
      const viewer = await options.viewerService.ensureViewer(user);
      let creditsCost = 0;

      if (options.creditService && options.tierGuard) {
        const sub = await options.creditService.getSubscription(viewer.workspace.id);
        const planConfig = getPlanConfig(sub.plan);
        const quality: ImageQualityLevel = planConfig.maxResolution;
        options.tierGuard.checkModelAccess(sub.plan, model);
        await options.tierGuard.checkConcurrency(viewer.workspace.id, sub.plan);
        creditsCost = options.tierGuard.calculateCreditCost(model, "image_generation", { quality });

        // Deduct credits before generation
        if (creditsCost > 0) {
          await options.creditService.deductCredits(
            viewer.workspace.id, user.id, creditsCost, undefined,
            `Direct image generation: ${model}`,
          );
        }
      }

      const providerName = resolveImageProviderName(model);
      const result = await generateImage(providerName, {
        prompt: payload.prompt,
        model,
        aspectRatio: payload.aspectRatio ?? "1:1",
      });

      // Download and persist to Supabase Storage
      const { signedUrl, assetId } = await downloadAndUpload(
        result.url,
        result.mimeType,
        payload.prompt,
        user,
        options,
      );

      return reply.code(200).send({
        url: signedUrl,
        assetId,
        prompt: payload.prompt,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      // Handle tier/credit errors
      if (error instanceof TierGuardError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: { code: error.code, message: error.message },
          }),
        );
      }
      if (error instanceof CreditServiceError) {
        return reply.code(error.statusCode).send(
          applicationErrorResponseSchema.parse({
            error: { code: error.code, message: error.message },
          }),
        );
      }

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

async function downloadAndUpload(
  sourceUrl: string,
  mimeType: string,
  prompt: string,
  user: AuthenticatedUser,
  deps: { uploadService: UploadService; viewerService: ViewerService },
): Promise<{ signedUrl: string; assetId: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = mimeType === "image/webp" ? "webp" : "png";
  const slug = prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `gen-${slug}-${Date.now()}.${ext}`;

  const viewer = await deps.viewerService.ensureViewer(user);

  const result = await deps.uploadService.uploadFile(user, {
    bucket: "project-assets",
    fileName,
    fileBuffer: buffer,
    mimeType,
    workspaceId: viewer.workspace.id,
  });

  return { signedUrl: result.url, assetId: result.asset.id };
}
