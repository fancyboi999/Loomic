import { describe, expect, it, vi } from "vitest";

import { streamEventSchema } from "@loomic/shared";
import { AIMessage } from "langchain";

import type { LoomicAgentFactory } from "../src/agent/deep-agent.js";
import type { AgentPersistenceService } from "../src/agent/persistence/index.js";
import type { AgentRunMetadataService } from "../src/features/agent-runs/agent-run-service.js";
import { createAgentRunService } from "../src/agent/runtime.js";
import type { StreamEvent } from "@loomic/shared";

const TEST_ENV = {
  agentBackendMode: "state" as const,
  agentModel: "test",
  port: 3001,
  version: "9.9.9-test",
  webOrigin: "http://localhost:3000",
};

/** Collect all events from a streamRun generator. */
async function collectEvents(
  gen: AsyncGenerator<StreamEvent>,
  options?: { onEvent?: (event: StreamEvent) => void },
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of gen) {
    events.push(event);
    options?.onEvent?.(event);
  }
  return events;
}

describe("deep-agent runtime integration", () => {
  it("starts a runtime-backed run and streams tool and text events", async () => {
    const agentRuns = createAgentRunService({
      agentFactory: () =>
        createScriptedAgent([
          {
            event: "on_tool_start",
            data: { input: { query: "foundation" } },
            name: "project_search",
            run_id: "tool_call_1",
          },
          {
            event: "on_tool_end",
            data: {
              output: JSON.stringify({
                matchCount: 1,
                summary: "Found 1 workspace match",
                matches: [{ path: "/workspace/docs/foundation.md", line: 1, text: "foundation" }],
              }),
            },
            name: "project_search",
            run_id: "tool_call_1",
          },
          {
            event: "on_chat_model_end",
            data: {
              output: new AIMessage({
                content: "Found the Loomic foundation docs.",
                id: "message_2",
              }),
            },
          },
        ]),
      env: TEST_ENV,
      eventDelayMs: 5,
    });

    const created = agentRuns.createRun({
      canvasId: "test-canvas-1",
      conversationId: "conversation_123",
      prompt: "Search the workspace for Loomic foundation docs",
      sessionId: "session_123",
    });

    const events = await collectEvents(agentRuns.streamRun(created.runId));
    const eventTypes = events.map((e) => e.type);

    expect(eventTypes).toEqual([
      "run.started",
      "tool.started",
      "tool.completed",
      "message.delta",
      "run.completed",
    ]);

    const toolStarted = events.find((e) => e.type === "tool.started");
    const toolCompleted = events.find((e) => e.type === "tool.completed");
    const messageDelta = events.find((e) => e.type === "message.delta");

    if (
      !toolStarted ||
      toolStarted.type !== "tool.started" ||
      !toolCompleted ||
      toolCompleted.type !== "tool.completed" ||
      !messageDelta ||
      messageDelta.type !== "message.delta"
    ) {
      throw new Error("Expected tool and message events.");
    }

    expect(toolStarted.toolCallId).toBeTruthy();
    expect(toolCompleted.toolCallId).toBe(toolStarted.toolCallId);
    expect(toolCompleted.outputSummary).toContain("workspace match");
    expect(messageDelta.delta).toContain("Found the Loomic foundation docs.");
  });

  it("emits run.canceled when an active runtime-backed run is canceled", async () => {
    const agentRuns = createAgentRunService({
      agentFactory: () =>
        createScriptedAgent([
          {
            event: "on_tool_start",
            data: { input: { query: "foundation" } },
            name: "project_search",
            run_id: "tool_call_1",
          },
          {
            event: "on_tool_end",
            data: {
              output: JSON.stringify({
                matchCount: 1,
                summary: "Found 1 workspace match",
                matches: [{ path: "/workspace/docs/foundation.md", line: 1, text: "foundation" }],
              }),
            },
            name: "project_search",
            run_id: "tool_call_1",
          },
          {
            event: "on_chat_model_end",
            data: {
              output: new AIMessage({
                content: "Found the Loomic foundation docs.",
                id: "message_2",
              }),
            },
          },
        ]),
      env: TEST_ENV,
      eventDelayMs: 50,
    });

    const created = agentRuns.createRun({
      canvasId: "test-canvas-1",
      conversationId: "conversation_123",
      prompt: "Search the workspace for Loomic foundation docs",
      sessionId: "session_123",
    });

    const events = await collectEvents(agentRuns.streamRun(created.runId), {
      onEvent: (event) => {
        if (event.type === "tool.started") {
          agentRuns.cancelRun(created.runId);
        }
      },
    });

    expect(events.map((e) => e.type)).toContain("run.canceled");
    expect(events.map((e) => e.type)).not.toContain("run.completed");
  });

  it("emits run.failed when the runtime cannot create an agent stream", async () => {
    const agentRuns = createAgentRunService({
      agentFactory: () => {
        throw new Error("agent factory exploded");
      },
      env: TEST_ENV,
    });

    const created = agentRuns.createRun({
      canvasId: "test-canvas-1",
      conversationId: "conversation_123",
      prompt: "Search the workspace for Loomic foundation docs",
      sessionId: "session_123",
    });

    const events = await collectEvents(agentRuns.streamRun(created.runId));
    const failedEvent = events.at(-1);

    if (!failedEvent || failedEvent.type !== "run.failed") {
      throw new Error("Expected run.failed event.");
    }

    expect(failedEvent.error.code).toBe("run_failed");
    expect(failedEvent.error.message).toBe("agent factory exploded");
  });

  it("passes the stable thread_id and injected persistence into runtime-backed agent creation", async () => {
    const capturedAgentOptions: Array<{
      checkpointer?: unknown;
      store?: unknown;
    }> = [];
    const capturedConfigs: Array<Record<string, unknown>> = [];
    const checkpointer = { kind: "checkpointer" };
    const store = { kind: "store" };
    const persistenceService = {
      getPersistence: vi.fn().mockResolvedValue({ checkpointer, store }),
    } satisfies AgentPersistenceService;

    const agentRuns = createAgentRunService({
      agentPersistenceService: persistenceService,
      agentRunMetadataService: createAgentRunMetadataServiceStub({}),
      agentFactory: (options) => {
        capturedAgentOptions.push({
          checkpointer: options.checkpointer,
          store: options.store,
        });
        return createEmptyAgent((config) => {
          capturedConfigs.push(config as Record<string, unknown>);
        });
      },
      env: TEST_ENV,
    });

    for (let index = 0; index < 2; index += 1) {
      const created = agentRuns.createRun(
        {
          canvasId: "test-canvas-1",
          conversationId: "conversation_123",
          prompt: `Prompt ${index + 1}`,
          sessionId: "session_123",
        },
        { threadId: "thread_stable" },
      );
      await collectEvents(agentRuns.streamRun(created.runId));
    }

    expect(capturedAgentOptions).toEqual([
      { checkpointer, store },
      { checkpointer, store },
    ]);
    expect(capturedConfigs).toEqual([
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: "thread_stable",
        }),
      }),
      expect.objectContaining({
        configurable: expect.objectContaining({
          thread_id: "thread_stable",
        }),
      }),
    ]);
  });

  it("updates persisted run metadata when a threaded run completes", async () => {
    const persistedUpdates: Array<{ runId: string; status: string }> = [];

    const agentRuns = createAgentRunService({
      agentPersistenceService: {
        async getPersistence() {
          return {
            checkpointer: {} as never,
            store: {} as never,
          };
        },
      },
      agentRunMetadataService: createAgentRunMetadataServiceStub({
        onUpdate(input) {
          persistedUpdates.push({
            runId: input.runId,
            status: input.status,
          });
        },
      }),
      agentFactory: () =>
        createRawEventAgent([
          {
            data: {
              output: new AIMessage({
                content: "Persist status",
                id: "message_1",
              }),
            },
            event: "on_chat_model_end",
          },
        ]),
      env: TEST_ENV,
      eventDelayMs: 5,
    });

    const created = agentRuns.createRun(
      {
        canvasId: "test-canvas-1",
        conversationId: "conversation_123",
        prompt: "Persist status",
        sessionId: "session_123",
      },
      { threadId: "thread_stable" },
    );

    const events = await collectEvents(agentRuns.streamRun(created.runId));

    expect(events.map((e) => e.type)).toContain("run.completed");
    expect(persistedUpdates).toEqual(
      expect.arrayContaining([
        { runId: created.runId, status: "running" },
        { runId: created.runId, status: "completed" },
      ]),
    );
  });

  it("passes canvasId and accessToken into agent configurable", async () => {
    const capturedConfigs: Array<Record<string, unknown>> = [];

    const agentRuns = createAgentRunService({
      agentFactory: () =>
        createEmptyAgent((config) => {
          capturedConfigs.push(config as Record<string, unknown>);
        }),
      env: TEST_ENV,
    });

    const created = agentRuns.createRun(
      {
        canvasId: "canvas-abc",
        conversationId: "conversation_123",
        prompt: "test canvas context",
        sessionId: "session_123",
      },
      { accessToken: "test-token" },
    );

    await collectEvents(agentRuns.streamRun(created.runId));

    expect(capturedConfigs.length).toBeGreaterThan(0);
    expect(capturedConfigs[0]).toMatchObject({
      configurable: expect.objectContaining({
        canvas_id: "canvas-abc",
      }),
    });
  });

  it("emits run.failed when threaded persistence initialization fails", async () => {
    const agentRuns = createAgentRunService({
      agentPersistenceService: {
        async getPersistence() {
          throw new Error("persistence exploded");
        },
      },
      agentRunMetadataService: createAgentRunMetadataServiceStub({}),
      env: TEST_ENV,
    });

    const created = agentRuns.createRun(
      {
        canvasId: "test-canvas-1",
        conversationId: "conversation_123",
        prompt: "Persist status",
        sessionId: "session_123",
      },
      { threadId: "thread_stable" },
    );

    const events = await collectEvents(agentRuns.streamRun(created.runId));
    const failedEvent = events.at(-1);

    if (!failedEvent || failedEvent.type !== "run.failed") {
      throw new Error("Expected run.failed event.");
    }

    expect(failedEvent.error.message).toBe("persistence exploded");
  });
});

function createAgentRunMetadataServiceStub(options: {
  onUpdate?: (input: { runId: string; status: string }) => void;
}): AgentRunMetadataService {
  return {
    async createAcceptedRun() {},
    async updateRun(input) {
      options.onUpdate?.({
        runId: input.runId,
        status: input.status,
      });
    },
  };
}

function createEmptyAgent(
  onStreamEvents: (config: unknown) => void,
): ReturnType<LoomicAgentFactory> {
  return {
    stream: undefined,
    streamEvents(_input: unknown, config: unknown) {
      onStreamEvents(config);
      return (async function* () {})() as never;
    },
  } as unknown as ReturnType<LoomicAgentFactory>;
}

function createRawEventAgent(
  events: Array<Record<string, unknown>>,
): ReturnType<LoomicAgentFactory> {
  return {
    stream: undefined,
    streamEvents() {
      return (async function* () {
        for (const event of events) {
          yield event;
        }
      })() as never;
    },
  } as unknown as ReturnType<LoomicAgentFactory>;
}

function createScriptedAgent(
  events: Array<Record<string, unknown>>,
): ReturnType<LoomicAgentFactory> {
  return {
    stream: undefined,
    streamEvents() {
      return (async function* () {
        for (const event of events) {
          yield event;
        }
      })() as never;
    },
  } as unknown as ReturnType<LoomicAgentFactory>;
}
