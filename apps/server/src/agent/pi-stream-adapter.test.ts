import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { adaptPiAgentStream } from "./pi-stream-adapter.js";

async function collect(events: AgentEvent[], signal?: AbortSignal) {
  const result = [];
  for await (const event of adaptPiAgentStream({
    conversationId: "conversation-1",
    runId: "run-1",
    sessionId: "session-1",
    now: () => "2026-10-09T00:00:00.000Z",
    ...(signal ? { signal } : {}),
    stream: (async function* () { yield* events; })(),
  })) result.push(event);
  return result;
}

describe("Pi event adapter", () => {
  it("streams thinking and text with a stable message id", async () => {
    const events = [
      { type: "message_start", message: { role: "assistant" } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "plan" } },
      { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "done" } },
      { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] } },
    ] as AgentEvent[];
    const result = await collect(events);
    expect(result.map((event) => event.type)).toEqual([
      "run.started", "thinking.delta", "message.delta", "run.completed",
    ]);
    expect(result[1]).toMatchObject({ messageId: "message_run-1_1", delta: "plan" });
    expect(result[2]).toMatchObject({ messageId: "message_run-1_1", delta: "done" });
  });

  it("pairs tool calls and emits canvas sync with a structured image artifact", async () => {
    const result = await collect([
      { type: "tool_execution_start", toolCallId: "tool-1", toolName: "manipulate_canvas", args: { action: "insert" } },
      { type: "tool_execution_end", toolCallId: "tool-1", toolName: "manipulate_canvas", result: { content: [{ type: "text", text: JSON.stringify({ summary: "created", imageUrl: "https://cdn.example/image.png", mimeType: "image/png", width: 512, height: 512 }) }] }, isError: false },
    ] as unknown as AgentEvent[]);
    expect(result.map((event) => event.type)).toEqual([
      "run.started", "tool.started", "tool.completed", "canvas.sync", "run.completed",
    ]);
    expect(result[2]).toMatchObject({ toolCallId: "tool-1", output: { summary: "created" }, artifacts: [{ type: "image", url: "https://cdn.example/image.png" }] });
  });

  it("keeps video artifact metadata and title fallback", async () => {
    const result = await collect([
      { type: "tool_execution_end", toolCallId: "tool-video", toolName: "generate_video", result: { content: [{ type: "text", text: JSON.stringify({ videoUrl: "https://cdn.example/video.mp4", mimeType: "video/mp4", width: 1280, height: 720, durationSeconds: 4, prompt: "A blue bird" }) }] }, isError: false },
    ] as unknown as AgentEvent[]);
    expect(result[1]).toMatchObject({
      type: "tool.completed",
      artifacts: [{ type: "video", title: "A blue bird", durationSeconds: 4 }],
    });
  });

  it("reports a model error as a failed run", async () => {
    const result = await collect([
      { type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "provider failed", content: [] } },
    ] as unknown as AgentEvent[]);
    expect(result.at(-1)).toMatchObject({ type: "run.failed", error: { code: "run_failed" } });
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await collect([], controller.signal);
    expect(result.at(-1)?.type).toBe("run.canceled");
  });
});
