import { describe, expect, it } from "vitest";

import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";

import { adaptDeepAgentStream } from "../src/agent/stream-adapter.js";

describe("deep-agent stream adapter (streamEvents v2)", () => {
  it("maps streamEvents onto Loomic SSE events with token-level streaming", async () => {
    const stream = makeStream([
      // Token-level streaming from chat model
      {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({
            content: "",
            tool_calls: [
              {
                args: { query: "foundation" },
                id: "tool_call_1",
                name: "project_search",
                type: "tool_call",
              },
            ],
          }),
        },
        run_id: "model_run_1",
      },
      // Tool starts
      {
        event: "on_tool_start",
        name: "project_search",
        data: { input: { query: "foundation" } },
        run_id: "tool_run_1",
        metadata: { tool_call_id: "tool_call_1" },
      },
      // Tool completes
      {
        event: "on_tool_end",
        name: "project_search",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              matchCount: 2,
              summary: "Matched 2 files",
            }),
            name: "project_search",
            tool_call_id: "tool_call_1",
          }),
        },
        run_id: "tool_run_1",
        metadata: { tool_call_id: "tool_call_1" },
      },
      // Token-level streaming of final response
      {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({
            content: "Found the ",
            id: "message_model_2",
          }),
        },
        run_id: "model_run_2",
      },
      {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({
            content: "Loomic foundation docs.",
            id: "message_model_2",
          }),
        },
        run_id: "model_run_2",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conversation_123",
        now: () => "2026-03-23T12:00:00.000Z",
        runId: "run_123",
        sessionId: "session_123",
        stream,
      }),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "run.started" }),
      // tool.started from on_tool_start event (uses run_id as toolCallId)
      expect.objectContaining({
        toolCallId: "tool_run_1",
        toolName: "project_search",
        type: "tool.started",
      }),
      expect.objectContaining({
        outputSummary: "Matched 2 files",
        toolCallId: "tool_run_1",
        toolName: "project_search",
        type: "tool.completed",
      }),
      // Token-level text deltas
      expect.objectContaining({
        delta: "Found the ",
        messageId: "message_model_2",
        type: "message.delta",
      }),
      expect.objectContaining({
        delta: "Loomic foundation docs.",
        messageId: "message_model_2",
        type: "message.delta",
      }),
      expect.objectContaining({ type: "run.completed" }),
    ]);
  });

  it("emits run.canceled when the stream is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conversation_123",
        now: () => "2026-03-23T12:00:00.000Z",
        runId: "run_123",
        sessionId: "session_123",
        signal: controller.signal,
        stream: makeStream([]),
      }),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "run.started" }),
      expect.objectContaining({ type: "run.canceled" }),
    ]);
  });

  it("emits run.failed when the underlying stream raises", async () => {
    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conversation_123",
        now: () => "2026-03-23T12:00:00.000Z",
        runId: "run_123",
        sessionId: "session_123",
        stream: failingStream(new Error("deep agent crashed")),
      }),
    );

    expect(events).toEqual([
      expect.objectContaining({ type: "run.started" }),
      expect.objectContaining({
        error: expect.objectContaining({
          code: "run_failed",
          message: "deep agent crashed",
        }),
        type: "run.failed",
      }),
    ]);
  });
});

async function collectEvents(stream: AsyncIterable<unknown>) {
  const events: unknown[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

async function* makeStream(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function* failingStream(error: Error) {
  yield { event: "on_chain_start", data: {} };
  throw error;
}
