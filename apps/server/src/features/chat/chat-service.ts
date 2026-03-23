import type {
  ChatMessage,
  ChatMessageCreateRequest,
  ChatSessionSummary,
  Json,
} from "@loomic/shared";

import type { AuthenticatedUser, UserSupabaseClient } from "../../supabase/user.js";

export class ChatServiceError extends Error {
  readonly statusCode: number;
  readonly code: "chat_error" | "session_not_found";

  constructor(
    code: "chat_error" | "session_not_found",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ChatService = {
  listSessions(
    user: AuthenticatedUser,
    canvasId: string,
  ): Promise<ChatSessionSummary[]>;
  createSession(
    user: AuthenticatedUser,
    canvasId: string,
    title?: string,
  ): Promise<ChatSessionSummary>;
  updateSessionTitle(
    user: AuthenticatedUser,
    sessionId: string,
    title: string,
  ): Promise<void>;
  deleteSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<void>;
  listMessages(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<ChatMessage[]>;
  createMessage(
    user: AuthenticatedUser,
    sessionId: string,
    input: ChatMessageCreateRequest,
  ): Promise<ChatMessage>;
};

export function createChatService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): ChatService {
  return {
    async listSessions(user, canvasId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("chat_sessions")
        .select("id, title, updated_at")
        .eq("canvas_id", canvasId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new ChatServiceError("chat_error", "Failed to list sessions.", 500);
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
      }));
    },

    async createSession(user, canvasId, title) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("chat_sessions")
        .insert({
          canvas_id: canvasId,
          created_by: user.id,
          ...(title ? { title } : {}),
        })
        .select("id, title, updated_at")
        .single();

      if (error || !data) {
        throw new ChatServiceError("chat_error", "Failed to create session.", 500);
      }

      return {
        id: data.id,
        title: data.title,
        updatedAt: data.updated_at,
      };
    },

    async updateSessionTitle(user, sessionId, title) {
      const client = options.createUserClient(user.accessToken);
      const { error } = await client
        .from("chat_sessions")
        .update({ title })
        .eq("id", sessionId);

      if (error) {
        throw new ChatServiceError("chat_error", "Failed to update session title.", 500);
      }
    },

    async deleteSession(user, sessionId) {
      const client = options.createUserClient(user.accessToken);
      const { error } = await client
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) {
        throw new ChatServiceError("session_not_found", "Session not found.", 404);
      }
    },

    async listMessages(user, sessionId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("chat_messages")
        .select("id, role, content, tool_activities, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new ChatServiceError("chat_error", "Failed to list messages.", 500);
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        toolActivities: row.tool_activities as ChatMessage["toolActivities"],
        createdAt: row.created_at,
      }));
    },

    async createMessage(user, sessionId, input) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("chat_messages")
        .insert({
          session_id: sessionId,
          role: input.role,
          content: input.content,
          ...(input.toolActivities
            ? { tool_activities: input.toolActivities as unknown as Json }
            : {}),
        })
        .select("id, role, content, tool_activities, created_at")
        .single();

      if (error || !data) {
        throw new ChatServiceError("chat_error", "Failed to save message.", 500);
      }

      // Touch session updated_at
      await client
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      return {
        id: data.id,
        role: data.role as "user" | "assistant",
        content: data.content,
        toolActivities: data.tool_activities as ChatMessage["toolActivities"],
        createdAt: data.created_at,
      };
    },
  };
}
