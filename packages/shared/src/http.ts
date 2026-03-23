import { z } from "zod";

import { runIdSchema } from "./contracts.js";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("loomic-server"),
  version: z.string().min(1),
});

export const runCancelResponseSchema = z.object({
  runId: runIdSchema,
  status: z.enum(["canceling", "canceled"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type RunCancelResponse = z.infer<typeof runCancelResponseSchema>;
