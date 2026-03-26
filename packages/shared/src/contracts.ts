import { z } from "zod";

import { toolArtifactSchema } from "./artifacts.js";

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

export const imageAttachmentSchema = z.object({
  assetId: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().min(1),
});

export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string().min(1),
  canvasId: canvasIdSchema.optional(),
  attachments: z.array(imageAttachmentSchema).optional(),
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
  thumbnailUrl: z.string().nullable().optional(),
  workspace: workspaceSummarySchema,
  primaryCanvas: canvasSummarySchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const canvasContentSchema = z.object({
  elements: z.array(z.record(z.unknown())).default([]),
  appState: z.record(z.unknown()).default({}),
  files: z.record(z.record(z.unknown())).default({}),
});

export const canvasDetailSchema = z.object({
  id: canvasIdSchema,
  name: z.string().min(1),
  projectId: projectIdSchema,
  content: canvasContentSchema,
});

export const profileUpdateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

export const workspaceSettingsSchema = z.object({
  defaultModel: z.string().min(1),
});

export const modelInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
});

export const chatSessionIdSchema = identifierSchema;

export const chatToolActivitySchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
});

export const chatSessionSummarySchema = z.object({
  id: chatSessionIdSchema,
  title: z.string(),
  updatedAt: timestampSchema,
});

export const textBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const toolBlockSchema = z.object({
  type: z.literal("tool"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
});

export const imageBlockSchema = z.object({
  type: z.literal("image"),
  assetId: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().min(1),
  source: z.enum(["upload", "canvas-ref"]),
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  toolBlockSchema,
  imageBlockSchema,
]);

export const chatMessageSchema = z.object({
  id: identifierSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  toolActivities: z.array(chatToolActivitySchema).nullable().optional(),
  contentBlocks: z.array(contentBlockSchema).nullable().optional(),
  createdAt: timestampSchema,
});

export const chatMessageCreateRequestSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  toolActivities: z.array(chatToolActivitySchema).nullable().optional(),
  contentBlocks: z.array(contentBlockSchema).nullable().optional(),
});

export const assetBucketSchema = z.enum(["project-assets", "user-avatars"]);

export const assetObjectSchema = z.object({
  id: identifierSchema,
  bucket: assetBucketSchema,
  objectPath: z.string().min(1),
  mimeType: z.string().min(1).nullable(),
  byteSize: z.number().int().nonnegative().nullable(),
  workspaceId: workspaceIdSchema,
  projectId: projectIdSchema.nullable(),
  createdAt: timestampSchema,
});

export type AssetBucket = z.infer<typeof assetBucketSchema>;
export type AssetObject = z.infer<typeof assetObjectSchema>;

export type TextBlock = z.infer<typeof textBlockSchema>;
export type ToolBlock = z.infer<typeof toolBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export type ContentBlock = z.infer<typeof contentBlockSchema>;
export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatMessageCreateRequest = z.infer<typeof chatMessageCreateRequestSchema>;
export type ChatToolActivity = z.infer<typeof chatToolActivitySchema>;
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type ModelInfo = z.infer<typeof modelInfoSchema>;
export type RunCreateRequest = z.infer<typeof runCreateRequestSchema>;
export type RunCreateResponse = z.infer<typeof runCreateResponseSchema>;
export type ViewerProfile = z.infer<typeof viewerProfileSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;
export type CanvasSummary = z.infer<typeof canvasSummarySchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type CanvasContent = z.infer<typeof canvasContentSchema>;
export type CanvasDetail = z.infer<typeof canvasDetailSchema>;
