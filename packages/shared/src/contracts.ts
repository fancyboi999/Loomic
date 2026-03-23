import { z } from "zod";

export const identifierSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });

export const sessionIdSchema = identifierSchema;
export const conversationIdSchema = identifierSchema;
export const runIdSchema = identifierSchema;
export const messageIdSchema = identifierSchema;
export const toolCallIdSchema = identifierSchema;
export const userIdSchema = identifierSchema;
export const workspaceIdSchema = identifierSchema;
export const projectIdSchema = identifierSchema;
export const canvasIdSchema = identifierSchema;

export const workspaceTypeSchema = z.enum(["personal", "team"]);
export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const runStatusSchema = z.enum([
  "accepted",
  "running",
  "completed",
  "failed",
]);

export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string().min(1),
});

export const runCreateResponseSchema = z.object({
  runId: runIdSchema,
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  status: z.literal("accepted"),
});

export const viewerProfileSchema = z.object({
  id: userIdSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().nullable().optional(),
});

export const workspaceSummarySchema = z.object({
  id: workspaceIdSchema,
  name: z.string().min(1),
  type: workspaceTypeSchema,
  ownerUserId: userIdSchema,
});

export const workspaceMembershipSchema = z.object({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema,
});

export const canvasSummarySchema = z.object({
  id: canvasIdSchema,
  name: z.string().min(1),
  isPrimary: z.boolean(),
});

export const projectSummarySchema = z.object({
  id: projectIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  workspace: workspaceSummarySchema,
  primaryCanvas: canvasSummarySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const canvasContentSchema = z.object({
  elements: z.array(z.record(z.unknown())).default([]),
  appState: z.record(z.unknown()).default({}),
});

export const canvasDetailSchema = z.object({
  id: canvasIdSchema,
  name: z.string().min(1),
  projectId: projectIdSchema,
  content: canvasContentSchema,
});

export type RunCreateRequest = z.infer<typeof runCreateRequestSchema>;
export type RunCreateResponse = z.infer<typeof runCreateResponseSchema>;
export type ViewerProfile = z.infer<typeof viewerProfileSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;
export type CanvasSummary = z.infer<typeof canvasSummarySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CanvasContent = z.infer<typeof canvasContentSchema>;
export type CanvasDetail = z.infer<typeof canvasDetailSchema>;
