import { describe, expect, it } from "vitest";
import { ToolMessage } from "@langchain/core/messages";

import { adaptDeepAgentStream } from "../src/agent/stream-adapter.js";

async function collectEvents(stream: AsyncIterable<any>) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function makeStream(rawEvents: unknown[]) {
  return (async function* () {
    for (const e of rawEvents) yield e;
  })();
}

describe("stream adapter placement extraction", () => {
  it("extracts placement from sub-agent task response", async () => {
    const stream = makeStream([
      {
        event: "on_tool_end",
        name: "task",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              url: "https://example.com/img.png",
              placement: { x: 100, y: 200, width: 512, height: 512 },
            }),
            name: "task",
            tool_call_id: "tc1",
          }),
        },
        run_id: "run_task_1",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conv1",
        runId: "run1",
        sessionId: "sess1",
        stream,
      }),
    );

    const toolCompleted = events.find((e: any) => e.type === "tool.completed");
    expect(toolCompleted).toBeDefined();
    expect(toolCompleted!.artifacts).toHaveLength(1);
    expect(toolCompleted!.artifacts![0]).toMatchObject({
      type: "image",
      url: "https://example.com/img.png",
      placement: { x: 100, y: 200, width: 512, height: 512 },
    });
  });

  it("still extracts legacy imageUrl format", async () => {
    // Use a non-inner tool name — generate_image is an inner sub-agent tool
    // whose artifacts are intentionally suppressed (parent task tool re-emits them)
    const stream = makeStream([
      {
        event: "on_tool_end",
        name: "image_task",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              imageUrl: "https://example.com/old.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            }),
            name: "image_task",
            tool_call_id: "tc2",
          }),
        },
        run_id: "run_tool_2",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conv1",
        runId: "run1",
        sessionId: "sess1",
        stream,
      }),
    );

    const toolCompleted = events.find((e: any) => e.type === "tool.completed");
    expect(toolCompleted!.artifacts).toHaveLength(1);
    expect(toolCompleted!.artifacts![0]).toMatchObject({
      type: "image",
      url: "https://example.com/old.png",
    });
  });
});
