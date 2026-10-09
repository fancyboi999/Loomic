import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseOtelSpanAttributes, startObservation, type LangfuseGeneration, type LangfuseTool } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { TraceFlags } from "@opentelemetry/api";
import type { AgentEvent, StreamFn } from "@earendil-works/pi-agent-core";

import type { ServerEnv } from "../config/env.js";

type TraceContext = {
  runId: string;
  sessionId: string;
  canvasId?: string;
  threadId?: string;
  userId?: string;
  modelId: string;
  input: string;
};

type TraceStatus = "completed" | "failed" | "canceled";

let processor: LangfuseSpanProcessor | undefined;
let sdk: NodeSDK | undefined;
const activeTraceparents = new Map<string, string>();

export function getRunTraceparent(runId: string): string | undefined {
  return activeTraceparents.get(runId);
}

/** Langfuse is optional. A telemetry outage must never fail an Agent run. */
function initialize(env: ServerEnv): LangfuseSpanProcessor | undefined {
  if (!env.langfusePublicKey && !env.langfuseSecretKey) return undefined;
  if (!env.langfusePublicKey || !env.langfuseSecretKey) {
    console.warn("[langfuse] Both LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required.");
    return undefined;
  }
  if (processor) return processor;
  try {
    processor = new LangfuseSpanProcessor({
      publicKey: env.langfusePublicKey,
      secretKey: env.langfuseSecretKey,
      ...(env.langfuseBaseUrl ? { baseUrl: env.langfuseBaseUrl } : {}),
    });
    sdk = new NodeSDK({ spanProcessors: [processor] });
    sdk.start();
    return processor;
  } catch (error) {
    processor = undefined;
    sdk = undefined;
    console.warn("[langfuse] Initialization failed:", safeError(error));
    return undefined;
  }
}

export function createAgentTrace(env: ServerEnv, context: TraceContext) {
  const exporter = initialize(env);
  if (!exporter) return { recordModelRequest: (_context: Parameters<StreamFn>[1]) => {}, record: (_event: AgentEvent, _subagent?: boolean) => {}, finish: async (_status: TraceStatus) => {} };

  let root: ReturnType<typeof startObservation> | undefined;
  let turn: ReturnType<typeof startObservation> | undefined;
  let generation: LangfuseGeneration | undefined;
  const tools = new Map<string, LangfuseTool>();
  let ended = false;
  let modelFailed = false;
  let modelInput: unknown;
  let finalAnswer: string | undefined;
  let turnOutput: unknown;
  let lastToolResults: unknown;
  let turnCount = 0;
  const tags = new Set(["pi-agent", `model:${context.modelId}`]);

  try {
    root = startObservation("loomic-agent", {
      input: safeText(context.input),
      metadata: {
        externalTraceId: context.runId,
        runId: context.runId,
        chatSessionId: context.sessionId,
        ...(context.canvasId ? { canvasId: context.canvasId } : {}),
        ...(context.threadId ? { threadId: context.threadId } : {}),
        modelId: context.modelId,
      },
    });
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, "loomic-agent");
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, context.canvasId ?? context.sessionId);
    root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, [...tags]);
    if (context.userId) root.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, context.userId);
    const spanContext = root.otelSpan.spanContext();
    activeTraceparents.set(context.runId, `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags.toString(16).padStart(2, "0")}`);
  } catch (error) {
    console.warn("[langfuse] Trace start failed:", safeError(error));
  }

  return {
    recordModelRequest(request: Parameters<StreamFn>[1]) {
      // Capture the exact normalized transcript handed to Pi's model stream.
      modelInput = { messages: request.messages.slice(-12).map((message) => ({
        role: message.role,
        content: typeof message.content === "string" ? safeText(message.content) : message.content.map((part) => {
          if (part.type === "text") return { type: "text", text: safeText(part.text) };
          if (part.type === "image") return { type: "image", mimeType: part.mimeType };
          if (part.type === "toolCall") return { type: "toolCall", name: part.name, arguments: safeValue(part.arguments) };
          return { type: part.type };
        }),
      })) };
    },
    record(event: AgentEvent, subagent = false) {
      if (!root || ended) return;
      try {
        if (event.type === "turn_start") {
          turn?.end();
          turn = root.startObservation(`turn-${++turnCount}`, {
            input: turnCount === 1 ? safeText(context.input) : safeValue(lastToolResults),
          });
          turnOutput = undefined;
        } else if (event.type === "turn_end") {
          turn?.update({ output: turnOutput });
          turn?.end();
          turn = undefined;
          lastToolResults = event.toolResults;
        } else if (event.type === "message_start" && event.message.role === "assistant") {
          generation?.end();
          generation = (turn ?? root).startObservation(subagent ? "subagent:model" : "model", {
            model: context.modelId, input: modelInput,
            ...(subagent ? { metadata: { subagent: true } } : {}),
          }, { asType: "generation" });
          modelInput = undefined;
        } else if (event.type === "message_end" && event.message.role === "assistant") {
          const message = event.message;
          const usage = message.usage;
          const answer = safeText(message.content.filter((part) => part.type === "text").map((part) => part.text).join(""));
          const toolCalls = message.content.filter((part) => part.type === "toolCall").map((part) => ({
            name: part.name, arguments: safeValue(part.arguments),
          }));
          const modelOutput = toolCalls.length ? { text: answer, toolCalls } : answer;
          if (!subagent) turnOutput = modelOutput;
          generation?.update({
            model: message.model ?? context.modelId,
            output: modelOutput,
            metadata: { provider: message.provider, stopReason: message.stopReason },
            ...(usage ? {
              usageDetails: {
                input: usage.input, output: usage.output,
                cache_read_input_tokens: usage.cacheRead,
                cache_creation_input_tokens: usage.cacheWrite,
                total: usage.totalTokens,
                ...(usage.reasoning !== undefined ? { reasoning: usage.reasoning } : {}),
              },
              costDetails: {
                input: usage.cost.input, output: usage.cost.output,
                cache_read_input_tokens: usage.cost.cacheRead,
                cache_creation_input_tokens: usage.cost.cacheWrite,
                total: usage.cost.total,
              },
            } : {}),
            ...(message.stopReason === "error" ? { level: "ERROR" as const, statusMessage: safeText(message.errorMessage ?? "Model failed") } : {}),
          });
          generation?.end();
          generation = undefined;
          if (message.stopReason === "stop" && !subagent) finalAnswer = answer;
          if (message.stopReason === "error" && !subagent) modelFailed = true;
        } else if (event.type === "tool_execution_start") {
          if (event.toolName === "generate_image" || event.toolName === "generate_video") tags.add(`tool:${event.toolName}`);
          tools.set(event.toolCallId, (turn ?? root).startObservation(event.toolName, {
            input: safeValue(event.args),
            metadata: { toolCallId: event.toolCallId, ...(subagent ? { subagent: true } : {}) },
          }, { asType: "tool" }));
        } else if (event.type === "tool_execution_end") {
          const span = tools.get(event.toolCallId);
          span?.update({
            output: safeValue(event.result),
            metadata: { durationMs: event.durationMs, isError: event.isError },
            ...(event.isError ? { level: "ERROR" as const, statusMessage: "Tool failed" } : {}),
          });
          span?.end();
          tools.delete(event.toolCallId);
        }
      } catch (error) {
        console.warn("[langfuse] Event recording failed:", safeError(error));
      }
    },
    async finish(status: TraceStatus) {
      if (ended) return;
      ended = true;
      activeTraceparents.delete(context.runId);
      try {
        generation?.end();
        for (const span of tools.values()) span.end();
        turn?.end();
        tags.add(`status:${modelFailed && status === "completed" ? "failed" : status}`);
        root?.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, [...tags]);
        root?.update({
          output: { status: modelFailed && status === "completed" ? "failed" : status, ...(finalAnswer ? { answer: finalAnswer } : {}) },
          ...(status === "failed" || modelFailed ? { level: "ERROR", statusMessage: "Agent run failed" } : {}),
        });
        root?.end();
        await flush(exporter);
      } catch (error) {
        console.warn("[langfuse] Trace flush failed:", safeError(error));
      }
    },
  };
}

/** A Worker observation is a child of the Agent trace when traceparent is present. */
export function createJobTrace(env: ServerEnv, context: {
  jobId: string;
  jobType: string;
  runId?: string;
  traceparent?: string;
  attempt: number;
}) {
  const exporter = initialize(env);
  if (!exporter || !context.runId) return { finish: async (_status: TraceStatus, _error?: string) => {} };
  const match = /^00-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i.exec(context.traceparent ?? "");
  let span: ReturnType<typeof startObservation> | undefined;
  try {
    span = startObservation(`job:${context.jobType}`, {
      metadata: { jobId: context.jobId, runId: context.runId, attempt: context.attempt },
    }, match ? {
      parentSpanContext: {
        traceId: match[1]!, spanId: match[2]!, traceFlags: Number.parseInt(match[3]!, 16) as TraceFlags,
      },
    } : undefined);
  } catch (error) {
    console.warn("[langfuse] Job trace start failed:", safeError(error));
  }
  return {
    async finish(status: TraceStatus, error?: string) {
      try {
        span?.update({
          output: { status },
          ...(status === "failed" ? { level: "ERROR", statusMessage: safeText(error ?? "Job failed") } : {}),
        });
        span?.end();
        await flush(exporter);
      } catch (flushError) {
        console.warn("[langfuse] Job trace flush failed:", safeError(flushError));
      }
    },
  };
}

function safeValue(value: unknown): unknown {
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map(safeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
      key,
      /token|secret|key|authorization|base64|signed.?url|data/i.test(key) ? "[REDACTED]" : safeValue(item),
    ]));
  }
  return value;
}

function safeText(value: string): string {
  return value.slice(0, 4000)
    .replace(/data:[^;\s]+;base64,[a-zA-Z0-9+/=]+/g, "[IMAGE]")
    .replace(/https?:\/\/[^\s<>"']+/g, "[URL]")
    .replace(/\b(?:sk|pk)_[a-zA-Z0-9_-]+\b/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function safeError(error: unknown): string {
  return safeText(error instanceof Error ? error.message : String(error));
}

async function flush(exporter: LangfuseSpanProcessor): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exporter.forceFlush(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Langfuse flush timed out")), 8000);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
