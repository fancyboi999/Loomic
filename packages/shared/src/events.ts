import { z } from "zod";

import { toolArtifactSchema } from "./artifacts.js";
import {
  conversationIdSchema,
  messageIdSchema,
  runIdSchema,
  sessionIdSchema,
  timestampSchema,
  toolCallIdSchema,
} from "./contracts.js";
import { loomicErrorSchema } from "./errors.js";

export { imageArtifactSchema, placementSchema, toolArtifactSchema } from "./artifacts.js";
export type { ImageArtifact, Placement, ToolArtifact } from "./artifacts.js";

export const runStartedEventSchema = z.object({
  type: z.literal("run.started"),
  runId: runIdSchema,
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  timestamp: timestampSchema,
});

export const messageDeltaEventSchema = z.object({
  type: z.literal("message.delta"),
  runId: runIdSchema,
  messageId: messageIdSchema,
  delta: z.string(),
  timestamp: timestampSchema,
});

export const toolStartedEventSchema = z.object({
  type: z.literal("tool.started"),
  runId: runIdSchema,
  toolCallId: toolCallIdSchema,
  toolName: z.string().min(1),
  input: z.record(z.unknown()).optional(),
  timestamp: timestampSchema,
});

export const toolCompletedEventSchema = z.object({
  type: z.literal("tool.completed"),
  runId: runIdSchema,
  toolCallId: toolCallIdSchema,
  toolName: z.string().min(1),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
  timestamp: timestampSchema,
});

export const runCompletedEventSchema = z.object({
  type: z.literal("run.completed"),
  runId: runIdSchema,
  timestamp: timestampSchema,
});

export const runCanceledEventSchema = z.object({
  type: z.literal("run.canceled"),
  runId: runIdSchema,
  timestamp: timestampSchema,
});

export const runFailedEventSchema = z.object({
  type: z.literal("run.failed"),
  runId: runIdSchema,
  error: loomicErrorSchema,
  timestamp: timestampSchema,
});

export const thinkingDeltaEventSchema = z.object({
  type: z.literal("thinking.delta"),
  runId: runIdSchema,
  messageId: messageIdSchema,
  delta: z.string(),
  timestamp: timestampSchema,
});

export const canvasSyncEventSchema = z.object({
  type: z.literal("canvas.sync"),
  runId: runIdSchema,
  timestamp: timestampSchema,
});

export const creditsInsufficientEventSchema = z.object({
  type: z.literal("credits.insufficient"),
  runId: runIdSchema,
  timestamp: timestampSchema,
  currentBalance: z.number(),
  requiredAmount: z.number(),
  plan: z.string(),
  dailyClaimed: z.boolean(),
});

export const streamEventSchema = z.discriminatedUnion("type", [
  runStartedEventSchema,
  messageDeltaEventSchema,
  thinkingDeltaEventSchema,
  toolStartedEventSchema,
  toolCompletedEventSchema,
  runCanceledEventSchema,
  runCompletedEventSchema,
  runFailedEventSchema,
  canvasSyncEventSchema,
  creditsInsufficientEventSchema,
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;
