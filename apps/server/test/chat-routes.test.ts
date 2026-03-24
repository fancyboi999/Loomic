import { afterEach, describe, expect, it } from "vitest";

import type {
  ChatMessage,
  ChatMessageCreateRequest,
  ChatSessionSummary,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";
import { createChatService } from "../src/features/chat/chat-service.js";
import type { AuthenticatedUser } from "../src/supabase/user.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

const SESSION: ChatSessionSummary = {
  id: "session-1",
  title: "Test Chat",
  updatedAt: "2026-03-23T00:00:00.000Z",
};

const MESSAGE: ChatMessage = {
  id: "msg-1",
  role: "user",
  content: "Hello",
  createdAt: "2026-03-23T00:00:00.000Z",
};

describe("chat routes", () => {
  it("GET /api/canvases/:canvasId/sessions returns session list", async () => {
    const authUser = stubUser();

    const app = buildChatApp({
      auth: createAuthStub(authUser),
      chatService: createChatServiceStub({
        sessions: [SESSION],
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/canvases/canvas-1/sessions",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { sessions: ChatSessionSummary[] };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]!.id).toBe("session-1");
  });

  it("POST /api/canvases/:canvasId/sessions creates a session", async () => {
    const authUser = stubUser();

    const app = buildChatApp({
      auth: createAuthStub(authUser),
      chatService: createChatServiceStub({}),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/canvases/canvas-1/sessions",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      payload: { title: "My Chat" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { session: ChatSessionSummary };
    expect(body.session.title).toBe("My Chat");
  });

  it("createSession persists a generated thread_id for new sessions", async () => {
    const insertedRows: Record<string, unknown>[] = [];
    const service = createChatService({
      createUserClient() {
        return {
          from() {
            return {
              insert(row: Record<string, unknown>) {
                insertedRows.push(row);
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: {
                            id: "session-1",
                            title: "New Chat",
                            updated_at: "2026-03-24T00:00:00.000Z",
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        } as never;
      },
      threadService: {
        createThreadId() {
          return "thread-123";
        },
      },
    });

    await service.createSession(stubUser(), "canvas-1");

    expect(insertedRows[0]).toMatchObject({
      canvas_id: "canvas-1",
      created_by: "user-1",
      thread_id: "thread-123",
    });
  });

  it("GET /api/sessions/:sessionId/messages returns messages", async () => {
    const authUser = stubUser();

    const app = buildChatApp({
      auth: createAuthStub(authUser),
      chatService: createChatServiceStub({
        messages: [MESSAGE],
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/session-1/messages",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { messages: ChatMessage[] };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]!.content).toBe("Hello");
  });

  it("POST /api/sessions/:sessionId/messages saves a message", async () => {
    const authUser = stubUser();

    const app = buildChatApp({
      auth: createAuthStub(authUser),
      chatService: createChatServiceStub({}),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/sessions/session-1/messages",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
        "content-type": "application/json",
      },
      payload: { role: "user", content: "Test message" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { message: ChatMessage };
    expect(body.message.content).toBe("Test message");
  });

  it("DELETE /api/sessions/:sessionId deletes a session", async () => {
    const authUser = stubUser();

    const app = buildChatApp({
      auth: createAuthStub(authUser),
      chatService: createChatServiceStub({}),
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/sessions/session-1",
      headers: { authorization: `Bearer ${authUser.accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildChatApp({
      auth: createAuthStub(null),
      chatService: createChatServiceStub({}),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/canvases/canvas-1/sessions",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
  });
});

function stubUser() {
  return {
    accessToken: "chat-test-token",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function createChatServiceStub(data: {
  sessions?: ChatSessionSummary[];
  messages?: ChatMessage[];
}) {
  return {
    async listSessions() {
      return data.sessions ?? [];
    },
    async createSession(
      _u: AuthenticatedUser,
      _c: string,
      title?: string,
    ): Promise<ChatSessionSummary> {
      return {
        id: "new-session-1",
        title: title ?? "New Chat",
        updatedAt: "2026-03-23T00:00:00.000Z",
      };
    },
    async updateSessionTitle() {},
    async deleteSession() {},
    async listMessages() {
      return data.messages ?? [];
    },
    async createMessage(
      _u: AuthenticatedUser,
      _s: string,
      input: ChatMessageCreateRequest,
    ): Promise<ChatMessage> {
      return {
        id: "new-msg-1",
        role: input.role,
        content: input.content,
        createdAt: "2026-03-23T00:00:00.000Z",
      };
    },
  };
}

function buildChatApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof buildApp>> {
  const app = buildApp({
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
    },
    ...overrides,
  });
  appsUnderTest.add(app);
  return app;
}

function createAuthStub(user: {
  accessToken: string;
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
} | null) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (!user) return null;
      if (request.headers.authorization === `Bearer ${user.accessToken}`) {
        return user;
      }
      return null;
    },
  };
}
