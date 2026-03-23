import { describe, expect, it } from "vitest";

import { AIMessage, ToolMessage } from "langchain";

import { adaptDeepAgentStream } from "../src/agent/stream-adapter.js";

describe("deep-agent stream adapter", () => {
  it("maps deep-agent chunks onto Loomic SSE events", async () => {
    const stream = makeStream([
      [
        "updates",
        {
          model_request: {
            messages: [
              new AIMessage({
                content: "",
                id: "message_model_1",
                tool_calls: [
                  {
                    args: {
                      query: "foundation",
                    },
                    id: "tool_call_1",
                    name: "project_search",
                    type: "tool_call",
                  },
                ],
              }),
            ],
          },
        },
      ],
      [
        "tools",
        {
          event: "on_tool_start",
          input: JSON.stringify({
            query: "foundation",
          }),
          name: "project_search",
          toolCallId: "tool_call_1",
        },
      ],
      [
        "tools",
        {
          event: "on_tool_end",
          name: "project_search",
          output: new ToolMessage({
            content: JSON.stringify({
              matchCount: 2,
              summary: "Matched 2 files",
            }),
            name: "project_search",
            tool_call_id: "tool_call_1",
          }),
          toolCallId: "tool_call_1",
        },
      ],
      [
        "updates",
        {
          model_request: {
            messages: [
              new AIMessage({
                content: "Found the Loomic foundation docs.",
                id: "message_model_2",
              }),
            ],
          },
        },
      ],
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
        toolCallId: "tool_call_1",
        toolName: "project_search",
        type: "tool.started",
      }),
      expect.objectContaining({
        outputSummary: "Matched 2 files",
        toolCallId: "tool_call_1",
        toolName: "project_search",
        type: "tool.completed",
      }),
      expect.objectContaining({
        delta: "Found the Loomic foundation docs.",
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
  yield null;
  throw error;
}
