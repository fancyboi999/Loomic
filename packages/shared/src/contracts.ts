import { z } from "zod";

export const identifierSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });

export const sessionIdSchema = identifierSchema;
export const conversationIdSchema = identifierSchema;
export const runIdSchema = identifierSchema;
export const messageIdSchema = identifierSchema;
export const toolCallIdSchema = identifierSchema;

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

export type RunCreateRequest = z.infer<typeof runCreateRequestSchema>;
export type RunCreateResponse = z.infer<typeof runCreateResponseSchema>;
