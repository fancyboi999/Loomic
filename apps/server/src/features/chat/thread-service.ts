import { randomUUID } from "node:crypto";

import type { AuthenticatedUser, UserSupabaseClient } from "../../supabase/user.js";

export class ThreadServiceError extends Error {
  readonly statusCode: number;
  readonly code: "session_not_found";

  constructor(message: string, statusCode: number) {
    super(message);
    this.code = "session_not_found";
    this.statusCode = statusCode;
  }
}

export type SessionThreadBinding = {
  sessionId: string;
  threadId: string;
};

export type ThreadService = {
  createThreadId(): string;
  resolveOwnedSessionThread(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<SessionThreadBinding>;
};

export function createThreadService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
  threadIdFactory?: () => string;
}): ThreadService {
  const threadIdFactory =
    options.threadIdFactory ?? (() => `thread_${randomUUID()}`);

  return {
    createThreadId() {
      return threadIdFactory();
    },

    async resolveOwnedSessionThread(user, sessionId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("chat_sessions")
        .select("id, thread_id")
        .eq("id", sessionId)
        .single();

      if (error || !data) {
        throw new ThreadServiceError("Session not found.", 404);
      }

      if (!data.thread_id) {
        throw new ThreadServiceError(
          "Session is not resumable because no thread is bound yet.",
          409,
        );
      }

      return {
        sessionId: data.id,
        threadId: data.thread_id,
      };
    },
  };
}
