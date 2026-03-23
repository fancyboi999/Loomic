import { z } from "zod";

import {
  projectSummarySchema,
  runIdSchema,
  viewerProfileSchema,
  workspaceMembershipSchema,
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
  "project_query_failed",
  "project_create_failed",
  "project_slug_taken",
]);

export const applicationErrorResponseSchema = z.object({
  error: z.object({
    code: applicationErrorCodeSchema,
    message: z.string().min(1),
  }),
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
