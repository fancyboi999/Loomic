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

  it("suppresses artifacts for generate_image when nested inside a sub-agent parent", async () => {
    // When generate_image runs inside image_generate (sub-agent), its artifacts
    // are suppressed because the parent will re-emit them with placement info.
    const stream = makeStream([
      // Parent sub-agent starts first
      {
        event: "on_tool_start",
        name: "image_generate",
        data: { input: { task: "generate a sunset" } },
        run_id: "parent_run",
        metadata: { tool_call_id: "parent_call" },
      },
      // Inner tool starts
      {
        event: "on_tool_start",
        name: "generate_image",
        data: { input: { prompt: "a sunset over mountains" } },
        run_id: "tool_run_img",
        metadata: { tool_call_id: "tool_call_img" },
      },
      // Inner tool ends — should be suppressed
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
      // Parent sub-agent ends — carries artifact with placement
      {
        event: "on_tool_end",
        name: "image_generate",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              url: "https://cdn.example.com/sunset.png",
              mimeType: "image/png",
              title: "Sunset",
              placement: { x: 100, y: 200, width: 512, height: 512 },
            }),
            name: "image_generate",
            tool_call_id: "parent_call",
          }),
        },
        run_id: "parent_run",
        metadata: { tool_call_id: "parent_call" },
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

    const innerCompleted = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "generate_image",
    ) as any;
    expect(innerCompleted).toBeDefined();
    // Inner tool artifacts suppressed
    expect(innerCompleted.artifacts).toBeUndefined();

    const parentCompleted = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "image_generate",
    ) as any;
    expect(parentCompleted).toBeDefined();
    // Parent carries the artifact with placement
    expect(parentCompleted.artifacts).toEqual([
      expect.objectContaining({
        type: "image",
        url: "https://cdn.example.com/sunset.png",
        placement: { x: 100, y: 200, width: 512, height: 512 },
      }),
    ]);
  });

  it("does NOT suppress artifacts for direct generate_image call (no sub-agent parent)", async () => {
    // When the main model calls generate_image directly (not inside a
    // sub-agent), artifacts must be emitted so the image appears on canvas.
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "generate_image",
        data: { input: { prompt: "a cute kitten" } },
        run_id: "tool_run_direct",
        metadata: { tool_call_id: "tool_call_direct" },
      },
      {
        event: "on_tool_end",
        name: "generate_image",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Generated a kitten image",
              imageUrl: "https://cdn.example.com/kitten.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
              placement: { x: 60, y: 240, width: 420, height: 420 },
            }),
            name: "generate_image",
            tool_call_id: "tool_call_direct",
          }),
        },
        run_id: "tool_run_direct",
        metadata: { tool_call_id: "tool_call_direct" },
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
    // Direct call — artifacts NOT suppressed
    expect(completed.artifacts).toEqual([
      expect.objectContaining({
        type: "image",
        url: "https://cdn.example.com/kitten.png",
        placement: { x: 60, y: 240, width: 420, height: 420 },
      }),
    ]);
  });

  it("extracts image artifacts from a non-inner-tool with imageUrl output", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "image_task",
        data: { input: { prompt: "a sunset over mountains" } },
        run_id: "tool_run_img2",
        metadata: { tool_call_id: "tool_call_img2" },
      },
      {
        event: "on_tool_end",
        name: "image_task",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Generated a sunset image",
              imageUrl: "https://cdn.example.com/sunset.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            }),
            name: "image_task",
            tool_call_id: "tool_call_img2",
          }),
        },
        run_id: "tool_run_img2",
        metadata: { tool_call_id: "tool_call_img2" },
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
      (e: any) => e.type === "tool.completed" && e.toolName === "image_task",
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

  it("extracts placement from legacy imageUrl format", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "image_task",
        data: { input: {} },
        run_id: "tool_run_legacy_placement",
        metadata: { tool_call_id: "tool_call_lp" },
      },
      {
        event: "on_tool_end",
        name: "image_task",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Generated image",
              imageUrl: "https://cdn.example.com/placed.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
              placement: { x: 50, y: 100, width: 400, height: 400 },
            }),
            name: "image_task",
            tool_call_id: "tool_call_lp",
          }),
        },
        run_id: "tool_run_legacy_placement",
        metadata: { tool_call_id: "tool_call_lp" },
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
      (e: any) => e.type === "tool.completed" && e.toolName === "image_task",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.artifacts).toEqual([
      expect.objectContaining({
        type: "image",
        url: "https://cdn.example.com/placed.png",
        placement: { x: 50, y: 100, width: 400, height: 400 },
      }),
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

  it("extracts screenshot artifact from tool output with screenshotUrl", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "screenshot_canvas",
        data: { input: { mode: "full", max_dimension: 1024 } },
        run_id: "tool_screenshot_1",
      },
      {
        event: "on_tool_end",
        name: "screenshot_canvas",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              summary: "Canvas screenshot captured (1024x768, mode: full)",
              screenshotUrl: "https://storage.example.com/screenshots/test.png",
              width: 1024,
              height: 768,
              mode: "full",
            }),
            name: "screenshot_canvas",
            tool_call_id: "tc_1",
          }),
        },
        run_id: "tool_screenshot_1",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "c1",
        now: () => "2026-03-27T00:00:00.000Z",
        runId: "run_1",
        sessionId: "s1",
        stream,
      }),
    );

    const completed = events.find(
      (e: any) => e.type === "tool.completed" && e.toolName === "screenshot_canvas",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.artifacts).toBeDefined();
    expect(completed.artifacts[0].type).toBe("image");
    expect(completed.artifacts[0].url).toBe(
      "https://storage.example.com/screenshots/test.png",
    );
    expect(completed.artifacts[0].width).toBe(1024);
    expect(completed.artifacts[0].height).toBe(768);
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

describe("extractOutput via tool.completed", () => {
  const baseOpts = {
    conversationId: "c",
    now: () => "2026-01-01T00:00:00.000Z",
    runId: "run_1",
    sessionId: "s",
  };

  it("includes structured output from tool end event", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "project_search",
        run_id: "tool_run_1",
        data: { input: { query: "test" } },
      },
      {
        event: "on_tool_end",
        name: "project_search",
        run_id: "tool_run_1",
        data: {
          output: JSON.stringify({
            matchCount: 3,
            summary: "Found 3 files",
            files: ["a.ts", "b.ts", "c.ts"],
          }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find(
      (e: any) => e.type === "tool.completed",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.output).toEqual({
      matchCount: 3,
      summary: "Found 3 files",
      files: ["a.ts", "b.ts", "c.ts"],
    });
  });

  it("strips artifact keys from output when artifacts are extracted", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "some_tool",
        run_id: "tool_run_2",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "some_tool",
        run_id: "tool_run_2",
        data: {
          output: JSON.stringify({
            imageUrl: "https://cdn.example.com/img.png",
            mimeType: "image/png",
            width: 512,
            height: 512,
            summary: "Generated image",
            extraInfo: "kept",
          }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find(
      (e: any) => e.type === "tool.completed",
    ) as any;
    expect(completed).toBeDefined();
    // artifact keys stripped, non-artifact keys kept
    expect(completed.output).toEqual({
      summary: "Generated image",
      extraInfo: "kept",
    });
  });

  it("returns undefined output when serialized size exceeds 10KB", async () => {
    const bigValue = "x".repeat(11000);
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "big_tool",
        run_id: "tool_run_3",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "big_tool",
        run_id: "tool_run_3",
        data: {
          output: JSON.stringify({ data: bigValue }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find(
      (e: any) => e.type === "tool.completed",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.output).toBeUndefined();
  });

  it("returns undefined output for non-parseable output", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "text_tool",
        run_id: "tool_run_4",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "text_tool",
        run_id: "tool_run_4",
        data: {
          output: "plain text output not json",
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find(
      (e: any) => e.type === "tool.completed",
    ) as any;
    expect(completed).toBeDefined();
    expect(completed.output).toBeUndefined();
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
