import { describe, expect, it } from "vitest";

import {
  ThreadServiceError,
  createThreadService,
} from "../src/features/chat/thread-service.js";

describe("thread service", () => {
  it("creates opaque thread ids", () => {
    const service = createThreadService({
      createUserClient() {
        throw new Error("not used");
      },
      threadIdFactory: () => "thread_test_123",
    });

    expect(service.createThreadId()).toBe("thread_test_123");
  });

  it("resolves an owned session thread", async () => {
    const service = createThreadService({
      createUserClient() {
        return createUserClientStub({
          data: {
            id: "session-1",
            thread_id: "thread-1",
          },
        });
      },
    });

    await expect(
      service.resolveOwnedSessionThread(stubUser(), "session-1"),
    ).resolves.toEqual({
      sessionId: "session-1",
      threadId: "thread-1",
    });
  });

  it("throws when the session cannot be resolved", async () => {
    const service = createThreadService({
      createUserClient() {
        return createUserClientStub({
          error: { message: "not found" },
        });
      },
    });

    await expect(
      service.resolveOwnedSessionThread(stubUser(), "missing-session"),
    ).rejects.toMatchObject({
      code: "session_not_found",
      statusCode: 404,
    });
  });

  it("throws when a legacy session does not have a thread binding yet", async () => {
    const service = createThreadService({
      createUserClient() {
        return createUserClientStub({
          data: {
            id: "session-1",
            thread_id: null,
          },
        });
      },
    });

    await expect(
      service.resolveOwnedSessionThread(stubUser(), "session-1"),
    ).rejects.toMatchObject({
      code: "session_not_found",
      statusCode: 409,
    });
  });
});

function stubUser() {
  return {
    accessToken: "token-123",
    email: "user@example.com",
    id: "user-1",
    userMetadata: {},
  };
}

function createUserClientStub(result: {
  data?: { id: string; thread_id: string | null };
  error?: { message: string } | null;
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return {
                    data: result.data ?? null,
                    error: result.error ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}
