import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  chatMessageCreateRequestSchema,
  messageCreateResponseSchema,
  messageListResponseSchema,
  sessionCreateResponseSchema,
  sessionListResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  ChatServiceError,
  type ChatService,
} from "../features/chat/chat-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerChatRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    chatService: ChatService;
  },
) {
  // List sessions for a canvas
  app.get<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/sessions",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const sessions = await options.chatService.listSessions(
          user,
          request.params.canvasId,
        );

        return reply
          .code(200)
          .send(sessionListResponseSchema.parse({ sessions }));
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Create a new session
  app.post<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId/sessions",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const body = request.body as { title?: string } | undefined;
        const session = await options.chatService.createSession(
          user,
          request.params.canvasId,
          body?.title,
        );

        return reply
          .code(201)
          .send(sessionCreateResponseSchema.parse({ session }));
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Update session title
  app.patch<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const body = request.body as { title?: string } | undefined;
        if (body?.title) {
          await options.chatService.updateSessionTitle(
            user,
            request.params.sessionId,
            body.title,
          );
        }

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Delete a session
  app.delete<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        await options.chatService.deleteSession(
          user,
          request.params.sessionId,
        );

        return reply.code(200).send({ ok: true });
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // List messages for a session
  app.get<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/messages",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const messages = await options.chatService.listMessages(
          user,
          request.params.sessionId,
        );

        return reply
          .code(200)
          .send(messageListResponseSchema.parse({ messages }));
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );

  // Create a message
  app.post<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/messages",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const input = chatMessageCreateRequestSchema.parse(request.body);
        const message = await options.chatService.createMessage(
          user,
          request.params.sessionId,
          input,
        );

        return reply
          .code(201)
          .send(messageCreateResponseSchema.parse({ message }));
      } catch (error) {
        return sendChatError(error, reply);
      }
    },
  );
}

function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    }),
  );
}

function sendChatError(error: unknown, reply: FastifyReply) {
  if (error instanceof ChatServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  if (isZodError(error)) {
    return reply.code(400).send({
      issues: error.issues,
      message: "Invalid request body",
    });
  }

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: {
        code: "application_error",
        message: "Internal server error.",
      },
    }),
  );
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
