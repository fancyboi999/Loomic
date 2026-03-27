import { z } from "zod";
import { streamEventSchema } from "./events.js";
import { runCreateRequestSchema } from "./contracts.js";

// --- Server → Client: Push Event (replaces SSE) ---

export const wsServerEventSchema = z.object({
  type: z.literal("event"),
  event: streamEventSchema,
});

// --- Server → Client: RPC Request ---

export const wsRpcRequestSchema = z.object({
  type: z.literal("rpc.request"),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.unknown()).default({}),
});

// --- Server → Client: Command Ack ---

export const wsCommandAckSchema = z.object({
  type: z.literal("command.ack"),
  action: z.string().min(1),
  payload: z.record(z.unknown()),
});

// --- Client → Server: Command ---

export const wsRunCommandSchema = z.object({
  type: z.literal("command"),
  action: z.literal("agent.run"),
  payload: runCreateRequestSchema,
});

export const wsCancelCommandSchema = z.object({
  type: z.literal("command"),
  action: z.literal("agent.cancel"),
  payload: z.object({ runId: z.string().min(1) }),
});

export const wsCommandSchema = z.discriminatedUnion("action", [
  wsRunCommandSchema,
  wsCancelCommandSchema,
]);

// --- Client → Server: RPC Response ---

export const wsRpcResponseSchema = z.object({
  type: z.literal("rpc.response"),
  id: z.string().min(1),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

// --- Union: Client → Server ---
// Uses z.union instead of z.discriminatedUnion because wsCommandSchema is itself
// a discriminated union (by "action"), which Zod v3 does not support as a nested
// element in another discriminatedUnion.

export const wsClientMessageSchema = z.union([
  wsRunCommandSchema,
  wsCancelCommandSchema,
  wsRpcResponseSchema,
]);

// --- Union: Server → Client ---

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsServerEventSchema,
  wsRpcRequestSchema,
  wsCommandAckSchema,
]);

// --- Type exports ---

export type WsServerEvent = z.infer<typeof wsServerEventSchema>;
export type WsRpcRequest = z.infer<typeof wsRpcRequestSchema>;
export type WsCommandAck = z.infer<typeof wsCommandAckSchema>;
export type WsRunCommand = z.infer<typeof wsRunCommandSchema>;
export type WsCancelCommand = z.infer<typeof wsCancelCommandSchema>;
export type WsCommand = z.infer<typeof wsCommandSchema>;
export type WsRpcResponse = z.infer<typeof wsRpcResponseSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

// --- Screenshot-specific params/result ---

export const screenshotParamsSchema = z.object({
  mode: z.enum(["full", "region", "viewport"]),
  region: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  max_dimension: z.number().default(1024),
});

export const screenshotResultSchema = z.object({
  url: z.string().min(1),
  width: z.number(),
  height: z.number(),
});

export type ScreenshotParams = z.infer<typeof screenshotParamsSchema>;
export type ScreenshotResult = z.infer<typeof screenshotResultSchema>;
