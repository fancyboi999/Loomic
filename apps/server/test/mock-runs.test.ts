import { afterEach, describe, expect, it } from "vitest";

import {
  runCancelResponseSchema,
  runCreateResponseSchema,
  streamEventSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("mock agent runs", () => {
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
    expect(payload.runId).toMatch(/^run_/);
    expect(payload.sessionId).toBe("session-1");
    expect(payload.conversationId).toBe("conversation-1");
    expect(payload.status).toBe("accepted");
  });

  it("streams SSE frames from the mock run", async () => {
    const server = await startServer({
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
      mockEventDelayMs: 5,
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "session-1",
        conversationId: "conversation-1",
        prompt: "Stream something",
      }),
    });

    const createdRun = runCreateResponseSchema.parse(
      await createResponse.json(),
    );
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );

    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    const events = await collectSseEvents(eventsResponse);
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes).toEqual([
      "run.started",
      "message.delta",
      "tool.started",
      "tool.completed",
      "run.completed",
    ]);
  });

  it("marks the run canceled and stops further mock events", async () => {
    const server = await startServer({
      env: {
        port: 3001,
        version: "9.9.9-test",
        webOrigin: "http://localhost:3000",
      },
      mockEventDelayMs: 20,
    });

    const createResponse = await fetch(`${server.baseUrl}/api/agent/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "session-1",
        conversationId: "conversation-1",
        prompt: "Cancel me",
      }),
    });

    const createdRun = runCreateResponseSchema.parse(
      await createResponse.json(),
    );
    const eventsResponse = await fetch(
      `${server.baseUrl}/api/agent/runs/${createdRun.runId}/events`,
    );
    let resolveCancelResponse: ((response: FetchResponse) => void) | null =
      null;
    const cancelResponsePromise = new Promise<FetchResponse>((resolve) => {
      resolveCancelResponse = resolve;
    });
    const eventsPromise = collectSseEvents(eventsResponse, {
      onEvent: async (event) => {
        if (event.type === "message.delta" && resolveCancelResponse) {
          const currentResolve = resolveCancelResponse;
          resolveCancelResponse = null;

          const cancelResponse = await fetch(
            `${server.baseUrl}/api/agent/runs/${createdRun.runId}/cancel`,
            {
              method: "POST",
            },
          );
          currentResolve(cancelResponse);
        }
      },
    });

    const events = await eventsPromise;
    const eventTypes = events.map((event) => event.type);
    const receivedCancelResponse = await withTimeout(cancelResponsePromise);

    expect(receivedCancelResponse.status).toBe(202);
    const canceled = runCancelResponseSchema.parse(
      await receivedCancelResponse.json(),
    );
    expect(canceled).toEqual({
      runId: createdRun.runId,
      status: "canceled",
    });
    expect(eventTypes).toContain("message.delta");
    expect(eventTypes).not.toContain("run.completed");
    expect(eventTypes).not.toContain("tool.completed");
  });
});

type ServerEnvOverride = {
  env: {
    port: number;
    version: string;
    webOrigin: string;
  };
  mockEventDelayMs: number;
};

async function startServer(options: ServerEnvOverride) {
  const app = buildApp(options);
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 1_000) {
  return await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error("Timed out waiting for cancel response"));
      }, timeoutMs);
    }),
  ]);
}
