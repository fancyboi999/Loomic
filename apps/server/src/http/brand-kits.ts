import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  brandKitAssetCreateRequestSchema,
  brandKitAssetUpdateRequestSchema,
  brandKitCreateRequestSchema,
  brandKitDetailResponseSchema,
  brandKitListResponseSchema,
  brandKitAssetResponseSchema,
  brandKitUpdateRequestSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  BrandKitServiceError,
  type BrandKitService,
} from "../features/brand-kit/brand-kit-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

type BrandKitErrorFallbackCode =
  | "brand_kit_not_found"
  | "brand_kit_create_failed"
  | "brand_kit_update_failed"
  | "brand_kit_delete_failed"
  | "brand_kit_query_failed"
  | "brand_kit_asset_not_found"
  | "brand_kit_asset_create_failed";

export async function registerBrandKitRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    brandKitService: BrandKitService;
  },
) {
  // GET /api/brand-kits — list kits
  app.get("/api/brand-kits", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const brandKits = await options.brandKitService.listKits(user);
      return reply
        .code(200)
        .send(brandKitListResponseSchema.parse({ brandKits }));
    } catch (error) {
      return sendBrandKitError(error, reply, "brand_kit_query_failed");
    }
  });

  // POST /api/brand-kits — create kit
  app.post("/api/brand-kits", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const payload = brandKitCreateRequestSchema.parse(request.body);
      const kit = await options.brandKitService.createKit(user, payload);

      return reply.code(201).send(brandKitDetailResponseSchema.parse(kit));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      return sendBrandKitError(error, reply, "brand_kit_create_failed");
    }
  });

  // GET /api/brand-kits/:kitId — get detail
  app.get("/api/brand-kits/:kitId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const { kitId } = request.params as { kitId: string };
      const kit = await options.brandKitService.getKit(user, kitId);

      return reply.code(200).send(brandKitDetailResponseSchema.parse(kit));
    } catch (error) {
      return sendBrandKitError(error, reply, "brand_kit_not_found");
    }
  });

  // PATCH /api/brand-kits/:kitId — update kit
  app.patch("/api/brand-kits/:kitId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const { kitId } = request.params as { kitId: string };
      const payload = brandKitUpdateRequestSchema.parse(request.body);
      const kit = await options.brandKitService.updateKit(user, kitId, payload);

      return reply.code(200).send(brandKitDetailResponseSchema.parse(kit));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      return sendBrandKitError(error, reply, "brand_kit_update_failed");
    }
  });

  // DELETE /api/brand-kits/:kitId — delete kit
  app.delete("/api/brand-kits/:kitId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const { kitId } = request.params as { kitId: string };
      await options.brandKitService.deleteKit(user, kitId);

      return reply.code(204).send();
    } catch (error) {
      return sendBrandKitError(error, reply, "brand_kit_delete_failed");
    }
  });

  // POST /api/brand-kits/:kitId/assets — create asset
  app.post("/api/brand-kits/:kitId/assets", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);

      if (!user) {
        return sendUnauthenticated(reply);
      }

      const { kitId } = request.params as { kitId: string };
      const payload = brandKitAssetCreateRequestSchema.parse(request.body);
      const asset = await options.brandKitService.createAsset(
        user,
        kitId,
        payload,
      );

      return reply.code(201).send(brandKitAssetResponseSchema.parse(asset));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      return sendBrandKitError(error, reply, "brand_kit_asset_create_failed");
    }
  });

  // PATCH /api/brand-kits/:kitId/assets/:assetId — update asset
  app.patch(
    "/api/brand-kits/:kitId/assets/:assetId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);

        if (!user) {
          return sendUnauthenticated(reply);
        }

        const { kitId, assetId } = request.params as {
          kitId: string;
          assetId: string;
        };
        const payload = brandKitAssetUpdateRequestSchema.parse(request.body);
        const asset = await options.brandKitService.updateAsset(
          user,
          kitId,
          assetId,
          payload,
        );

        return reply.code(200).send(brandKitAssetResponseSchema.parse(asset));
      } catch (error) {
        if (isZodError(error)) {
          return reply.code(400).send({
            issues: error.issues,
            message: "Invalid request body",
          });
        }

        return sendBrandKitError(error, reply, "brand_kit_update_failed");
      }
    },
  );

  // DELETE /api/brand-kits/:kitId/assets/:assetId — delete asset
  app.delete(
    "/api/brand-kits/:kitId/assets/:assetId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);

        if (!user) {
          return sendUnauthenticated(reply);
        }

        const { kitId, assetId } = request.params as {
          kitId: string;
          assetId: string;
        };
        await options.brandKitService.deleteAsset(user, kitId, assetId);

        return reply.code(204).send();
      } catch (error) {
        return sendBrandKitError(error, reply, "brand_kit_delete_failed");
      }
    },
  );
}

function sendUnauthenticated(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    }),
  );
}

function sendBrandKitError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode: BrandKitErrorFallbackCode,
) {
  if (error instanceof BrandKitServiceError) {
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
        message: "An unexpected error occurred.",
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
