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

  it("does not emit a duplicate full-message delta after token streaming for the same message", async () => {
    const stream = makeStream([
      {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({
            content: "你好，",
            id: "message_model_dup",
          }),
        },
        run_id: "model_run_dup",
      },
      {
        event: "on_chat_model_stream",
        data: {
          chunk: new AIMessageChunk({
            content: "西米！",
            id: "message_model_dup",
          }),
        },
        run_id: "model_run_dup",
      },
      {
        event: "on_chat_model_end",
        data: {
          output: new AIMessageChunk({
            content: "你好，西米！",
            id: "message_model_dup",
          }),
        },
        run_id: "model_run_dup",
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
      expect.objectContaining({
        delta: "你好，",
        messageId: "message_model_dup",
        type: "message.delta",
      }),
      expect.objectContaining({
        delta: "西米！",
        messageId: "message_model_dup",
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

  it("extracts image artifacts from generate_image tool output", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "generate_image",
        data: { input: { prompt: "a sunset over mountains" } },
        run_id: "tool_run_img",
        metadata: { tool_call_id: "tool_call_img" },
      },
      {
        event: "on_tool_end",
        name: "generate_image",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Generated a sunset image",
              imageUrl: "https://cdn.example.com/sunset.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            }),
            name: "generate_image",
            tool_call_id: "tool_call_img",
          }),
        },
        run_id: "tool_run_img",
        metadata: { tool_call_id: "tool_call_img" },
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

    const completed = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "generate_image",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.artifacts).toEqual([
      {
        type: "image",
        url: "https://cdn.example.com/sunset.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      },
    ]);
  });

  it("does not produce artifacts for non-image tool output", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "project_search",
        data: { input: { query: "test" } },
        run_id: "tool_run_search",
        metadata: { tool_call_id: "tool_call_search" },
      },
      {
        event: "on_tool_end",
        name: "project_search",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              matchCount: 5,
              summary: "Found 5 results",
            }),
            name: "project_search",
            tool_call_id: "tool_call_search",
          }),
        },
        run_id: "tool_run_search",
        metadata: { tool_call_id: "tool_call_search" },
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

    const completed = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "project_search",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.artifacts).toBeUndefined();
  });

  it("does not produce artifacts for failed image generation", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "generate_image",
        data: { input: { prompt: "a sunset" } },
        run_id: "tool_run_fail",
        metadata: { tool_call_id: "tool_call_fail" },
      },
      {
        event: "on_tool_end",
        name: "generate_image",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Image generation failed",
              error: "Rate limit exceeded",
            }),
            name: "generate_image",
            tool_call_id: "tool_call_fail",
          }),
        },
        run_id: "tool_run_fail",
        metadata: { tool_call_id: "tool_call_fail" },
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

    const completed = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "generate_image",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.artifacts).toBeUndefined();
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
