import { z } from "zod";

import {
  assetObjectSchema,
  canvasContentSchema,
  canvasDetailSchema,
  chatMessageSchema,
  chatSessionSummarySchema,
  modelInfoSchema,
  projectSummarySchema,
  runIdSchema,
  viewerProfileSchema,
  workspaceMembershipSchema,
  workspaceSettingsSchema,
  workspaceSummarySchema,
} from "./contracts.js";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("loomic-server"),
  version: z.string().min(1),
});

export const runCancelResponseSchema = z.object({
  runId: runIdSchema,
  status: z.enum(["canceling", "canceled"]),
});

export const viewerResponseSchema = z.object({
  profile: viewerProfileSchema,
  workspace: workspaceSummarySchema,
  membership: workspaceMembershipSchema,
});

export const projectListResponseSchema = z.object({
  projects: z.array(projectSummarySchema),
});

export const projectCreateRequestSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});

export const projectCreateResponseSchema = z.object({
  project: projectSummarySchema,
});

export const unauthenticatedErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal("unauthorized"),
    message: z.string().min(1),
  }),
});

export const applicationErrorCodeSchema = z.enum([
  "application_error",
  "bootstrap_failed",
  "brand_kit_not_found",
  "brand_kit_create_failed",
  "brand_kit_update_failed",
  "brand_kit_delete_failed",
  "brand_kit_query_failed",
  "brand_kit_asset_not_found",
  "brand_kit_asset_create_failed",
  "canvas_not_found",
  "canvas_save_failed",
  "chat_error",
  "profile_update_failed",
  "project_query_failed",
  "project_create_failed",
  "project_delete_failed",
  "project_not_found",
  "project_slug_taken",
  "project_update_failed",
  "session_not_found",
  "settings_not_found",
  "settings_update_failed",
  "upload_failed",
  "asset_not_found",
  "job_not_found",
  "job_create_failed",
  "job_query_failed",
  "job_cancel_failed",
]);

export const applicationErrorResponseSchema = z.object({
  error: z.object({
    code: applicationErrorCodeSchema,
    message: z.string().min(1),
  }),
});

export const canvasGetResponseSchema = z.object({
  canvas: canvasDetailSchema,
});

export const canvasSaveRequestSchema = z.object({
  content: canvasContentSchema,
});

export const canvasSaveResponseSchema = z.object({
  ok: z.literal(true),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type RunCancelResponse = z.infer<typeof runCancelResponseSchema>;
export type ViewerResponse = z.infer<typeof viewerResponseSchema>;
export type ProjectListResponse = z.infer<typeof projectListResponseSchema>;
export type ProjectCreateRequest = z.infer<typeof projectCreateRequestSchema>;
export type ProjectCreateResponse = z.infer<typeof projectCreateResponseSchema>;
export type UnauthenticatedErrorResponse = z.infer<
  typeof unauthenticatedErrorResponseSchema
>;
export type ApplicationErrorCode = z.infer<typeof applicationErrorCodeSchema>;
export type ApplicationErrorResponse = z.infer<
  typeof applicationErrorResponseSchema
>;
export const profileUpdateResponseSchema = z.object({
  profile: viewerProfileSchema,
});

export const workspaceSettingsResponseSchema = z.object({
  settings: workspaceSettingsSchema,
});

export const workspaceSettingsUpdateRequestSchema = workspaceSettingsSchema;

export const modelListResponseSchema = z.object({
  models: z.array(modelInfoSchema),
});

export const sessionListResponseSchema = z.object({
  sessions: z.array(chatSessionSummarySchema),
});

export const sessionCreateResponseSchema = z.object({
  session: chatSessionSummarySchema,
});

export const messageListResponseSchema = z.object({
  messages: z.array(chatMessageSchema),
});

export const messageCreateResponseSchema = z.object({
  message: chatMessageSchema,
});

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
export type SessionCreateResponse = z.infer<typeof sessionCreateResponseSchema>;
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;
export type MessageCreateResponse = z.infer<typeof messageCreateResponseSchema>;
export type CanvasGetResponse = z.infer<typeof canvasGetResponseSchema>;
export type CanvasSaveRequest = z.infer<typeof canvasSaveRequestSchema>;
export type CanvasSaveResponse = z.infer<typeof canvasSaveResponseSchema>;
export type ProfileUpdateResponse = z.infer<typeof profileUpdateResponseSchema>;
export type WorkspaceSettingsResponse = z.infer<typeof workspaceSettingsResponseSchema>;
export type WorkspaceSettingsUpdateRequest = z.infer<typeof workspaceSettingsUpdateRequestSchema>;
export type ModelListResponse = z.infer<typeof modelListResponseSchema>;

export const uploadResponseSchema = z.object({
  asset: assetObjectSchema,
  signedUrl: z.string().min(1),
});

export const assetSignedUrlResponseSchema = z.object({
  signedUrl: z.string().min(1),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;
export type AssetSignedUrlResponse = z.infer<typeof assetSignedUrlResponseSchema>;

export const projectUpdateRequestSchema = z.object({
  brand_kit_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(100).optional(),
});
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>;
