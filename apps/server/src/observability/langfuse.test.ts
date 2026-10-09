import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ServerEnv } from "../config/env.js";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  spans: [] as Array<{ name: string; attributes: any; otelAttributes: Record<string, unknown>; options: any; updates: any[]; ended: boolean; children: any[] }>,
  flush: vi.fn(async () => {}),
}));

vi.mock("@langfuse/otel", () => ({ LangfuseSpanProcessor: class { forceFlush = state.flush; } }));
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: class { start() {} } }));
vi.mock("@langfuse/tracing", () => {
  const createSpan = (name: string, attributes: any, options: any) => {
    const record = { name, attributes, otelAttributes: {} as Record<string, unknown>, options, updates: [] as any[], ended: false, children: [] as any[] };
    state.spans.push(record);
    return {
      otelSpan: {
        setAttribute: (key: string, value: unknown) => { record.otelAttributes[key] = value; },
        spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
      },
      update: (value: any) => record.updates.push(value),
      end: () => { record.ended = true; },
      startObservation: (childName: string, childAttributes: any, childOptions: any) => {
        const child = createSpan(childName, childAttributes, childOptions);
        record.children.push(state.spans.at(-1));
        return child;
      },
    };
  };
  return {
    LangfuseOtelSpanAttributes: { TRACE_NAME: "name", TRACE_SESSION_ID: "session", TRACE_USER_ID: "user", TRACE_TAGS: "tags" },
    startObservation: createSpan,
  };
});

import { createAgentTrace, createJobTrace, getRunTraceparent } from "./langfuse.js";

const env = { langfusePublicKey: "pk_test", langfuseSecretKey: "sk_test" } as ServerEnv;

describe("Langfuse Agent tracing", () => {
  it("groups model and tool observations by turn and records detailed usage", async () => {
    state.spans.length = 0;
    const trace = createAgentTrace(env, {
      runId: "turn-run", sessionId: "chat-1", modelId: "gemini-test", input: "Read the file",
    });
    trace.record({ type: "turn_start" });
    trace.record({ type: "message_start", message: { role: "assistant" } } as AgentEvent);
    trace.record({ type: "message_end", message: {
      role: "assistant", model: "gemini-test", stopReason: "toolUse",
      content: [{ type: "toolCall", id: "tool-1", name: "generate_image", arguments: { prompt: "cat" } }],
      usage: {
        input: 10, output: 5, cacheRead: 2, cacheWrite: 3, totalTokens: 20, reasoning: 1,
        cost: { input: 0.01, output: 0.02, cacheRead: 0.003, cacheWrite: 0.004, total: 0.037 },
      },
    } } as unknown as AgentEvent);
    trace.record({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "generate_image", args: { prompt: "cat" } } as AgentEvent);
    trace.record({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "generate_image", result: { jobId: "job-1" }, isError: false } as AgentEvent);
    trace.record({ type: "turn_end", message: { role: "assistant" }, toolResults: [{ role: "toolResult", content: [{ type: "text", text: "job-1" }] }] } as AgentEvent);
    trace.record({ type: "turn_start" });
    trace.record({ type: "message_start", message: { role: "assistant" } } as AgentEvent);
    trace.record({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Done" }], stopReason: "stop" } } as AgentEvent);
    trace.record({ type: "turn_end", message: { role: "assistant" }, toolResults: [] } as unknown as AgentEvent);
    await trace.finish("completed");

    const [root, firstTurn, firstModel, tool, secondTurn, secondModel] = state.spans;
    expect(root?.children).toContain(firstTurn);
    expect(firstTurn?.children).toEqual([firstModel, tool]);
    expect(secondTurn?.children).toEqual([secondModel]);
    expect(secondTurn?.attributes.input).toEqual([{ role: "toolResult", content: [{ type: "text", text: "job-1" }] }]);
    expect(firstModel?.updates[0].usageDetails).toMatchObject({ total: 20, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, reasoning: 1 });
    expect(firstModel?.updates[0].costDetails).toMatchObject({ input: 0.01, output: 0.02, total: 0.037 });
    expect(root?.otelAttributes.tags).toEqual(["pi-agent", "model:gemini-test", "tool:generate_image", "status:completed"]);
  });

  it("does nothing when Langfuse is not configured", async () => {
    state.spans.length = 0;
    const trace = createAgentTrace({} as ServerEnv, {
      runId: "run-off", sessionId: "chat-1", modelId: "test", input: "hello",
    });
    trace.record({ type: "agent_start" });
    await trace.finish("completed");
    expect(state.spans).toHaveLength(0);
  });

  it("records model usage and tool outcome with a Worker parent context", async () => {
    state.spans.length = 0;
    state.flush.mockClear();
    const trace = createAgentTrace(env, {
      runId: "run-1", sessionId: "chat-1", canvasId: "canvas-1", userId: "user-1",
      modelId: "gemini-test", input: "Bearer abc data:image/png;base64,AAAA",
    });
    const parent = getRunTraceparent("run-1");
    expect(parent).toMatch(/^00-a{32}-b{16}-01$/);
    trace.recordModelRequest({ messages: [
      { role: "system", content: "Follow the tool result", timestamp: 1 },
      { role: "user", content: [{ type: "text", text: "Read the file" }, { type: "image", mimeType: "image/png", data: "private-image" }], timestamp: 2 },
    ] } as Parameters<typeof trace.recordModelRequest>[0]);
    trace.record({ type: "message_start", message: { role: "assistant" } } as AgentEvent);
    trace.record({
      type: "message_end",
      message: {
        role: "assistant", model: "gemini-test", provider: "google", stopReason: "toolUse",
        content: [{ type: "text", text: "I will generate an image" }, { type: "toolCall", id: "tool-1", name: "generate_image", arguments: { prompt: "cat" } }],
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0, cost: { total: 0.01 } },
      },
    } as AgentEvent);
    trace.record({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "generate_image", args: { prompt: "cat", accessToken: "secret" } } as AgentEvent);
    trace.record({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "generate_image", result: { jobId: "job-1" }, isError: false, durationMs: 123 } as AgentEvent);
    trace.record({ type: "message_start", message: { role: "assistant" } } as AgentEvent);
    trace.record({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Image job started" }], stopReason: "stop" } } as AgentEvent);
    const job = createJobTrace(env, { jobId: "job-1", jobType: "image_generation", runId: "run-1", traceparent: parent!, attempt: 1 });
    await job.finish("completed");
    await trace.finish("completed");

    expect(state.spans[0]?.attributes.input).toContain("[IMAGE]");
    expect(state.spans[0]?.attributes.input).not.toContain("abc");
    expect(state.spans[1]?.updates[0].usageDetails).toMatchObject({ input: 10, output: 5 });
    expect(state.spans[1]?.updates[0].output.toolCalls).toEqual([{ name: "generate_image", arguments: { prompt: "cat" } }]);
    expect(state.spans[1]?.attributes.input.messages[1].content).toEqual([
      { type: "text", text: "Read the file" }, { type: "image", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(state.spans[1]?.attributes.input)).not.toContain("private-image");
    expect(state.spans[2]?.attributes.input.accessToken).toBe("[REDACTED]");
    expect(state.spans[2]?.updates[0].metadata).toMatchObject({ durationMs: 123, isError: false });
    expect(state.spans[0]?.updates[0].output).toEqual({ status: "completed", answer: "Image job started" });
    expect(state.spans[4]?.options.parentSpanContext.traceId).toBe("a".repeat(32));
    expect(getRunTraceparent("run-1")).toBeUndefined();
    expect(state.flush).toHaveBeenCalledTimes(2);
  });

  it("does not fail the run when Langfuse export fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.flush.mockRejectedValueOnce(new Error("collector unavailable"));
    try {
      const trace = createAgentTrace(env, {
        runId: "run-failure", sessionId: "chat-1", modelId: "gemini-test", input: "hello",
      });
      await expect(trace.finish("completed")).resolves.toBeUndefined();
      expect(getRunTraceparent("run-failure")).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
