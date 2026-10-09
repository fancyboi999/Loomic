import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { ServerEnv } from "../config/env.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentRunService } from "./runtime.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("agent run service with Pi", () => {
  it("passes the user turn into Pi and preserves the client stream contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-pi-run-"));
    roots.push(root);
    const stream = vi.fn(async function* () {
      yield { type: "message_start", message: { role: "assistant" } } as AgentEvent;
      yield { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hello" } } as AgentEvent;
      yield { type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Hello" }] } } as AgentEvent;
    });
    const service = createAgentRunService({
      env: {
        agentBackendMode: "filesystem",
        agentFilesRoot: root,
        skillsRoot: join(root, "skills"),
        agentModel: "gpt-4.1",
      } as ServerEnv,
      agentFactory: () => ({ stream }),
      runIdFactory: () => "run-1",
      now: () => "2026-10-09T00:00:00.000Z",
    });
    service.createRun({
      sessionId: "session-1",
      conversationId: "conversation-1",
      prompt: "Hello?",
    });

    const events = [];
    for await (const event of service.streamRun("run-1")) events.push(event);
    expect(events.map((event) => event.type)).toEqual(["run.started", "message.delta", "run.completed"]);
    expect(events[1]).toMatchObject({ delta: "Hello", runId: "run-1" });
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "Hello?" }),
      expect.objectContaining({ runId: "run-1", sessionId: "session-1" }),
      expect.any(AbortSignal),
    );
  });

  it("passes image bytes to Pi and keeps asset IDs available to tools", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-pi-image-run-"));
    roots.push(root);
    const stream = vi.fn(async function* () {});
    const service = createAgentRunService({
      env: {
        agentBackendMode: "filesystem",
        agentFilesRoot: root,
        skillsRoot: join(root, "skills"),
        agentModel: "gpt-4.1",
      } as ServerEnv,
      agentFactory: () => ({ stream }),
      runIdFactory: () => "run-image",
    });
    service.createRun({
      sessionId: "session-1",
      conversationId: "conversation-1",
      prompt: "Use this image",
      attachments: [{ assetId: "asset-1", url: "data:image/png;base64,YWJj", mimeType: "image/png" }],
    });

    for await (const _event of service.streamRun("run-image")) { /* Consume the run. */ }
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        content: [
          expect.objectContaining({ type: "text", text: expect.stringContaining('asset_id="asset-1"') }),
          { type: "image", data: "YWJj", mimeType: "image/png" },
        ],
      }),
      expect.objectContaining({ attachmentMap: { "asset-1": "data:image/png;base64,YWJj" } }),
      expect.any(AbortSignal),
    );
  });
});
