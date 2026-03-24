import { z } from "zod";

// === Entity Schemas ===

export const brandKitAssetTypeSchema = z.enum(["color", "font", "logo", "image"]);
export type BrandKitAssetType = z.infer<typeof brandKitAssetTypeSchema>;

export const brandKitAssetSchema = z.object({
  id: z.string().min(1),
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string(),
  role: z.string().nullable(),
  sort_order: z.number().int(),
  text_content: z.string().nullable(),
  file_url: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitAsset = z.infer<typeof brandKitAssetSchema>;

export const brandKitSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  is_default: z.boolean(),
  cover_url: z.string().nullable(),
  asset_counts: z.object({
    color: z.number().int(),
    font: z.number().int(),
    logo: z.number().int(),
    image: z.number().int(),
  }),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitSummary = z.infer<typeof brandKitSummarySchema>;

export const brandKitDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  is_default: z.boolean(),
  guidance_text: z.string().nullable(),
  cover_url: z.string().nullable(),
  assets: z.array(brandKitAssetSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitDetail = z.infer<typeof brandKitDetailSchema>;

// === Request Schemas ===

export const brandKitCreateRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type BrandKitCreateRequest = z.infer<typeof brandKitCreateRequestSchema>;

export const brandKitUpdateRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  guidance_text: z.string().max(5000).nullable().optional(),
  is_default: z.boolean().optional(),
});
export type BrandKitUpdateRequest = z.infer<typeof brandKitUpdateRequestSchema>;

export const brandKitAssetCreateRequestSchema = z.object({
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string().min(1).max(100),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});
export type BrandKitAssetCreateRequest = z.infer<typeof brandKitAssetCreateRequestSchema>;

export const brandKitAssetUpdateRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});
export type BrandKitAssetUpdateRequest = z.infer<typeof brandKitAssetUpdateRequestSchema>;

// === Response Schemas ===

export const brandKitListResponseSchema = z.object({
  brandKits: z.array(brandKitSummarySchema),
});
export type BrandKitListResponse = z.infer<typeof brandKitListResponseSchema>;

export const brandKitDetailResponseSchema = brandKitDetailSchema;
export type BrandKitDetailResponse = z.infer<typeof brandKitDetailResponseSchema>;

export const brandKitAssetResponseSchema = brandKitAssetSchema;
export type BrandKitAssetResponse = z.infer<typeof brandKitAssetResponseSchema>;
