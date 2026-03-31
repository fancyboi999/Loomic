import { afterEach, describe, expect, it } from "vitest";

import { AIMessage } from "langchain";

import {
  runCreateResponseSchema,
  streamEventSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";
import type { AgentRunMetadataService } from "../src/features/agent-runs/agent-run-service.js";
import {
  ThreadServiceError,
  type ThreadService,
} from "../src/features/chat/thread-service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("agent run routes", () => {
  it("creates a run record and returns a runId", async () => {
    const app = buildApp({
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
      mockEventDelayMs: 5,
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/runs",
      payload: {
        sessionId: "session-1",
        conversationId: "conversation-1",
        prompt: "Hello from test",
      },
    });

    expect(response.statusCode).toBe(202);

    const payload = runCreateResponseSchema.parse(response.json());
    expect(payload.runId).toMatch(uuidPattern);
    expect(payload.sessionId).toBe("session-1");
    expect(payload.conversationId).toBe("conversation-1");
    expect(payload.status).toBe("accepted");
  });

  it("persists accepted run metadata for authenticated session-backed runs", async () => {
    const acceptedRuns: Array<{
      model?: string;
      runId: string;
      sessionId: string;
      threadId: string;
    }> = [];
    const authUser = stubUser();

    const app = buildApp({
      agentRunMetadataService: createAgentRunMetadataServiceStub({
        onAcceptedRun(input) {
          acceptedRuns.push(input);
        },
      }),
      auth: createAuthStub(authUser),
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
      mockEventDelayMs: 5,
      threadService: createThreadServiceStub({
        sessionId: "session-1",
        threadId: "thread-1",
      }),
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/runs",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
      payload: {
        sessionId: "session-1",
        conversationId: "conversation-1",
        prompt: "Hello from test",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(acceptedRuns).toHaveLength(1);
    expect(acceptedRuns[0]).toMatchObject({
      sessionId: "session-1",
      threadId: "thread-1",
    });
    expect(acceptedRuns[0]?.runId).toMatch(uuidPattern);
  });

  it("rejects authenticated runs when the session cannot be resumed", async () => {
    const authUser = stubUser();

    const app = buildApp({
      auth: createAuthStub(authUser),
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
      mockEventDelayMs: 5,
      threadService: createThreadServiceStub({
        error: new ThreadServiceError("Session not found.", 404),
      }),
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/runs",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
      payload: {
        sessionId: "missing-session",
        conversationId: "conversation-1",
        prompt: "Hello from test",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "session_not_found",
      },
    });
  });

  it("streams events from a runtime-backed run", async () => {
    const { createAgentRunService } = await import("../src/agent/runtime.js");

    const agentRuns = createAgentRunService({
      agentFactory: () =>
        ({
          stream: undefined,
          streamEvents() {
            return (async function* () {
              yield {
                event: "on_chat_model_end",
                data: {
                  output: new AIMessage({
                    content: "Stream something back",
                    id: "message_1",
                  }),
                },
              };
            })() as never;
          },
        }) as any,
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
        agentBackendMode: "state" as const,
        agentModel: "test",
      },
      eventDelayMs: 5,
    });

    const created = agentRuns.createRun({
      canvasId: "test-canvas-1",
      sessionId: "session-1",
      conversationId: "conversation-1",
      prompt: "Stream something",
    });

    const events: Array<ReturnType<typeof streamEventSchema.parse>> = [];
    for await (const event of agentRuns.streamRun(created.runId)) {
      events.push(streamEventSchema.parse(event));
    }

    const eventTypes = events.map((e) => e.type);

    expect(eventTypes).toEqual([
      "run.started",
      "message.delta",
      "run.completed",
    ]);
  });

  it("marks the run canceled and stops further events", async () => {
    const { createAgentRunService } = await import("../src/agent/runtime.js");

    const agentRuns = createAgentRunService({
      agentFactory: () =>
        ({
          stream: undefined,
          streamEvents() {
            return (async function* () {
              yield {
                event: "on_chat_model_end",
                data: {
                  output: new AIMessage({
                    content: "Cancel me once",
                    id: "message_1",
                  }),
                },
              };
            })() as never;
          },
        }) as any,
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
        agentBackendMode: "state" as const,
        agentModel: "test",
      },
      eventDelayMs: 50,
    });

    const created = agentRuns.createRun({
      canvasId: "test-canvas-1",
      sessionId: "session-1",
      conversationId: "conversation-1",
      prompt: "Cancel me",
    });

    const events: Array<ReturnType<typeof streamEventSchema.parse>> = [];
    for await (const event of agentRuns.streamRun(created.runId)) {
      events.push(streamEventSchema.parse(event));
      if (event.type === "message.delta") {
        agentRuns.cancelRun(created.runId);
      }
    }

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("message.delta");
    expect(eventTypes).toContain("run.canceled");
    expect(eventTypes).not.toContain("run.completed");
  });
});

function stubUser() {
  return {
    accessToken: "run-test-token",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function createAuthStub(user: ReturnType<typeof stubUser> | null) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (!user) {
        return null;
      }

      return request.headers.authorization === `Bearer ${user.accessToken}`
        ? user
        : null;
    },
  };
}

function createThreadServiceStub(input: {
  sessionId?: string;
  threadId?: string;
  error?: ThreadServiceError;
}): ThreadService {
  return {
    createThreadId() {
      return "thread-generated";
    },
    async resolveOwnedSessionThread(_user, sessionId) {
      if (input.error) {
        throw input.error;
      }

      return {
        sessionId: input.sessionId ?? sessionId,
        threadId: input.threadId ?? "thread-1",
      };
    },
  };
}

function createAgentRunMetadataServiceStub(options: {
  onAcceptedRun?: (input: {
    model?: string;
    runId: string;
    sessionId: string;
    threadId: string;
  }) => void;
}): AgentRunMetadataService {
  return {
    async createAcceptedRun(input) {
      options.onAcceptedRun?.(input);
    },
    async updateRun() {},
  };
}

