import { afterEach, describe, expect, it, vi } from "vitest";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseChatModel as BaseChatModelClass } from "@langchain/core/language_models/chat_models";
import type { ChatResult } from "@langchain/core/outputs";
import type { Runnable } from "@langchain/core/runnables";
import { runCreateResponseSchema, streamEventSchema } from "@loomic/shared";
import { AIMessage, type BaseMessage } from "langchain";

import type { LoomicAgentFactory } from "../src/agent/deep-agent.js";
import type { AgentPersistenceService } from "../src/agent/persistence/index.js";
import type { AgentRunMetadataService } from "../src/features/agent-runs/agent-run-service.js";
import type { ThreadService } from "../src/features/chat/thread-service.js";
import { buildApp } from "../src/app.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("deep-agent runtime integration", () => {
  it("starts a runtime-backed run and streams tool and text events", async () => {
    const server = await startServer({
      agentModel: new ScriptedToolModel([
        {
          content: "",
          toolCalls: [
            {
              args: {
                query: "foundation",
              },
              id: "tool_call_1",
              name: "project_search",
            },
          ],
        },
        {
          content: "Found the Loomic foundation docs.",
        },
      ]),
      mockEventDelayMs: 5,
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        conversationId: "conversation_123",
        prompt: "Search the workspace for Loomic foundation docs",
        sessionId: "session_123",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(createResponse.status).toBe(202);
    const createdRun = runCreateResponseSchema.parse(
      await createResponse.json(),
    );
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    const events = await collectSseEvents(eventsResponse);
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes).toEqual([
      "run.started",
      "tool.started",
      "tool.completed",
      "message.delta",
      "run.completed",
    ]);

    const toolStarted = events.find((event) => event.type === "tool.started");
    const toolCompleted = events.find(
      (event) => event.type === "tool.completed",
    );
    const messageDelta = events.find((event) => event.type === "message.delta");

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
    const server = await startServer({
      agentModel: new ScriptedToolModel([
        {
          content: "",
          toolCalls: [
            {
              args: {
                query: "foundation",
              },
              id: "tool_call_1",
              name: "project_search",
            },
          ],
        },
        {
          content: "Found the Loomic foundation docs.",
        },
      ]),
      mockEventDelayMs: 20,
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        conversationId: "conversation_123",
        prompt: "Search the workspace for Loomic foundation docs",
        sessionId: "session_123",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const createdRun = runCreateResponseSchema.parse(
      await createResponse.json(),
    );
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );

    let canceled = false;
    const events = await collectSseEvents(eventsResponse, {
      onEvent: async (event) => {
        if (event.type === "tool.started" && !canceled) {
          canceled = true;
          await fetch(
            `${server.baseUrl}/api/agent/runs/${createdRun.runId}/cancel`,
            {
              method: "POST",
            },
          );
        }
      },
    });

    expect(events.map((event) => event.type)).toContain("run.canceled");
    expect(events.map((event) => event.type)).not.toContain("run.completed");
  });

  it("emits run.failed when the runtime cannot create an agent stream", async () => {
    const server = await startServer({
      createAgent: () => {
        throw new Error("agent factory exploded");
      },
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        conversationId: "conversation_123",
        prompt: "Search the workspace for Loomic foundation docs",
        sessionId: "session_123",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const createdRun = runCreateResponseSchema.parse(
      await createResponse.json(),
    );
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    const events = await collectSseEvents(eventsResponse);
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
    const authUser = stubUser();

    const server = await startServer({
      agentPersistenceService: persistenceService,
      agentRunMetadataService: createAgentRunMetadataServiceStub({}),
      auth: createAuthStub(authUser),
      createAgent: (options) => {
        capturedAgentOptions.push({
          checkpointer: options.checkpointer,
          store: options.store,
        });
        return createEmptyAgent((config) => {
          capturedConfigs.push(config as Record<string, unknown>);
        });
      },
      threadService: createThreadServiceStub({
        sessionId: "session_123",
        threadId: "thread_stable",
      }),
    });

    for (let index = 0; index < 2; index += 1) {
      const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
        body: JSON.stringify({
          conversationId: "conversation_123",
          prompt: `Prompt ${index + 1}`,
          sessionId: "session_123",
        }),
        headers: {
          authorization: `Bearer ${authUser.accessToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      const createdRun = runCreateResponseSchema.parse(
        await createResponse.json(),
      );
      const eventsResponse = await fetch(
        `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
      );
      await collectSseEvents(eventsResponse);
    }

    expect(capturedAgentOptions).toEqual([
      { checkpointer, store },
      { checkpointer, store },
    ]);
    expect(capturedConfigs).toEqual([
      expect.objectContaining({
        configurable: {
          thread_id: "thread_stable",
        },
      }),
      expect.objectContaining({
        configurable: {
          thread_id: "thread_stable",
        },
      }),
    ]);
  });

  it("updates persisted run metadata when a threaded run completes", async () => {
    const persistedUpdates: Array<{ runId: string; status: string }> = [];
    const authUser = stubUser();

    const server = await startServer({
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
      auth: createAuthStub(authUser),
      createAgent: () =>
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
      mockEventDelayMs: 5,
      threadService: createThreadServiceStub({
        sessionId: "session_123",
        threadId: "thread_stable",
      }),
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        conversationId: "conversation_123",
        prompt: "Persist status",
        sessionId: "session_123",
      }),
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const createdRun = runCreateResponseSchema.parse(await createResponse.json());
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    const events = await collectSseEvents(eventsResponse);

    expect(events.map((event) => event.type)).toContain("run.completed");
    expect(persistedUpdates).toEqual(
      expect.arrayContaining([
        { runId: createdRun.runId, status: "running" },
        { runId: createdRun.runId, status: "completed" },
      ]),
    );
  });

  it("passes canvasId and accessToken into agent configurable", async () => {
    const capturedConfigs: Array<Record<string, unknown>> = [];

    const server = await startServer({
      createAgent: () =>
        createEmptyAgent((config) => {
          capturedConfigs.push(config as Record<string, unknown>);
        }),
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        canvasId: "canvas-abc",
        conversationId: "conversation_123",
        prompt: "test canvas context",
        sessionId: "session_123",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const createdRun = runCreateResponseSchema.parse(await createResponse.json());
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    await collectSseEvents(eventsResponse);

    expect(capturedConfigs.length).toBeGreaterThan(0);
    expect(capturedConfigs[0]).toMatchObject({
      configurable: expect.objectContaining({
        canvas_id: "canvas-abc",
      }),
    });
  });

  it("emits run.failed when threaded persistence initialization fails", async () => {
    const authUser = stubUser();

    const server = await startServer({
      agentPersistenceService: {
        async getPersistence() {
          throw new Error("persistence exploded");
        },
      },
      agentRunMetadataService: createAgentRunMetadataServiceStub({}),
      auth: createAuthStub(authUser),
      threadService: createThreadServiceStub({
        sessionId: "session_123",
        threadId: "thread_stable",
      }),
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      body: JSON.stringify({
        conversationId: "conversation_123",
        prompt: "Persist status",
        sessionId: "session_123",
      }),
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const createdRun = runCreateResponseSchema.parse(await createResponse.json());
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    const events = await collectSseEvents(eventsResponse);
    const failedEvent = events.at(-1);

    if (!failedEvent || failedEvent.type !== "run.failed") {
      throw new Error("Expected run.failed event.");
    }

    expect(failedEvent.error.message).toBe("persistence exploded");
  });
});

async function startServer(options: {
  agentPersistenceService?: AgentPersistenceService;
  agentRunMetadataService?: AgentRunMetadataService;
  agentModel?: BaseChatModel;
  auth?: { authenticate(request: { headers: { authorization?: string } }): Promise<ReturnType<typeof stubUser> | null> };
  createAgent?: LoomicAgentFactory;
  mockEventDelayMs?: number;
  threadService?: ThreadService;
}) {
  const app = buildApp({
    ...(options.agentPersistenceService
      ? { agentPersistenceService: options.agentPersistenceService }
      : {}),
    ...(options.agentRunMetadataService
      ? { agentRunMetadataService: options.agentRunMetadataService }
      : {}),
    ...(options.auth ? { auth: options.auth } : {}),
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
    },
    ...(options.createAgent ? { agentFactory: options.createAgent } : {}),
    ...(options.agentModel ? { agentModel: options.agentModel } : {}),
    ...(options.mockEventDelayMs === undefined
      ? {}
      : { mockEventDelayMs: options.mockEventDelayMs }),
    ...(options.threadService ? { threadService: options.threadService } : {}),
  });
  appsUnderTest.add(app);

  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function stubUser() {
  return {
    accessToken: "runtime-test-token",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function createAuthStub(user: ReturnType<typeof stubUser>) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      return request.headers.authorization === `Bearer ${user.accessToken}`
        ? user
        : null;
    },
  };
}

function createThreadServiceStub(input: {
  sessionId: string;
  threadId: string;
}): ThreadService {
  return {
    createThreadId() {
      return input.threadId;
    },
    async resolveOwnedSessionThread() {
      return input;
    },
  };
}

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

async function collectSseEvents(
  response: Response,
  options?: {
    onEvent?: (
      event: ReturnType<typeof streamEventSchema.parse>,
    ) => Promise<void>;
  },
) {
  if (!response.body) {
    throw new Error("Expected response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: ReturnType<typeof streamEventSchema.parse>[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      const event = streamEventSchema.parse(JSON.parse(dataLine.slice(6)));
      events.push(event);

      if (options?.onEvent) {
        await options.onEvent(event);
      }
    }
  }

  return events;
}

type ScriptedResponse = {
  content: string;
  toolCalls?: Array<{
    args: Record<string, unknown>;
    id: string;
    name: string;
  }>;
};

class ScriptedToolModel extends BaseChatModelClass {
  private currentIndex = 0;

  constructor(private readonly script: ScriptedResponse[]) {
    super({});
  }

  _llmType() {
    return "scripted-tool-model";
  }

  _combineLLMOutput() {
    return [];
  }

  bindTools(): Runnable {
    return this;
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const response = this.script[this.currentIndex] ?? {
      content: "",
    };
    this.currentIndex += 1;

    const message = new AIMessage({
      content: response.content,
      id: `message_${this.currentIndex}`,
      ...(response.toolCalls
        ? {
            tool_calls: response.toolCalls.map((toolCall) => ({
              ...toolCall,
              type: "tool_call" as const,
            })),
          }
        : {}),
    });

    return {
      generations: [
        {
          message,
          text: response.content,
        },
      ],
      llmOutput: {},
    };
  }
}
