import type {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
} from "@langchain/core/messages";
import {
  AIMessageChunk as AIMessageChunkClass,
  AIMessage as AIMessageClass,
  ToolMessage as ToolMessageClass,
} from "@langchain/core/messages";

import type { StreamEvent } from "@loomic/shared";

type DeepAgentChunk =
  | ["messages", [AIMessage | AIMessageChunk | ToolMessage, unknown]]
  | ["updates", Record<string, unknown>];

type AdaptDeepAgentStreamOptions = {
  conversationId: string;
  now?: () => string;
  runId: string;
  sessionId: string;
  signal?: AbortSignal;
  stream: AsyncIterable<DeepAgentChunk | unknown>;
};

export async function* adaptDeepAgentStream(
  options: AdaptDeepAgentStreamOptions,
): AsyncGenerator<StreamEvent> {
  const now = options.now ?? (() => new Date().toISOString());
  const seenCompletedToolCalls = new Set<string>();
  const seenStartedToolCalls = new Set<string>();

  yield {
    conversationId: options.conversationId,
    runId: options.runId,
    sessionId: options.sessionId,
    timestamp: now(),
    type: "run.started",
  };

  if (options.signal?.aborted) {
    yield canceledEvent(options.runId, now);
    return;
  }

  try {
    for await (const chunk of options.stream) {
      if (options.signal?.aborted) {
        yield canceledEvent(options.runId, now);
        return;
      }

      if (isMessagesChunk(chunk)) {
        const [message] = chunk[1];

        if (
          AIMessageClass.isInstance(message) ||
          AIMessageChunkClass.isInstance(message)
        ) {
          for (const toolCall of message.tool_calls ?? []) {
            if (!toolCall.id || !toolCall.name) {
              continue;
            }

            if (seenStartedToolCalls.has(toolCall.id)) {
              continue;
            }

            seenStartedToolCalls.add(toolCall.id);
            yield {
              runId: options.runId,
              timestamp: now(),
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              type: "tool.started",
            };
          }

          if ((message.tool_calls?.length ?? 0) > 0) {
            continue;
          }

          const delta = extractMessageText(message.content);
          if (!delta) {
            continue;
          }

          yield {
            delta,
            messageId: message.id ?? `message_${options.runId}`,
            runId: options.runId,
            timestamp: now(),
            type: "message.delta",
          };
        }
      }

      if (isUpdatesChunk(chunk)) {
        for (const message of extractUpdatedMessages(chunk[1])) {
          if (!ToolMessageClass.isInstance(message)) {
            continue;
          }

          if (seenCompletedToolCalls.has(message.tool_call_id)) {
            continue;
          }

          seenCompletedToolCalls.add(message.tool_call_id);
          yield {
            outputSummary: summarizeToolMessage(message),
            runId: options.runId,
            timestamp: now(),
            toolCallId: message.tool_call_id,
            toolName: message.name ?? "unknown_tool",
            type: "tool.completed",
          };
        }
      }
    }
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      yield canceledEvent(options.runId, now);
      return;
    }

    yield {
      error: {
        code: "run_failed",
        message:
          error instanceof Error ? error.message : "Deep agent stream failed.",
      },
      runId: options.runId,
      timestamp: now(),
      type: "run.failed",
    };
    return;
  }

  yield {
    runId: options.runId,
    timestamp: now(),
    type: "run.completed",
  };
}

function canceledEvent(runId: string, now: () => string): StreamEvent {
  return {
    runId,
    timestamp: now(),
    type: "run.canceled",
  };
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("");
}

function extractUpdatedMessages(payload: Record<string, unknown>) {
  const messages: unknown[] = [];

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object" || !("messages" in value)) {
      continue;
    }

    const entryMessages = value.messages;
    if (Array.isArray(entryMessages)) {
      messages.push(...entryMessages);
    }
  }

  return messages;
}

function summarizeToolMessage(message: ToolMessage) {
  const parsed = tryParseJson(message.content);
  if (
    parsed &&
    typeof parsed === "object" &&
    "summary" in parsed &&
    typeof parsed.summary === "string"
  ) {
    return parsed.summary;
  }

  const textContent = extractMessageText(message.content);
  return textContent || undefined;
}

function tryParseJson(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "This operation was aborted")
  );
}

function isMessagesChunk(
  chunk: DeepAgentChunk | unknown,
): chunk is ["messages", [AIMessage | AIMessageChunk | ToolMessage, unknown]] {
  return (
    Array.isArray(chunk) &&
    chunk[0] === "messages" &&
    Array.isArray(chunk[1]) &&
    chunk[1].length >= 1
  );
}

function isUpdatesChunk(
  chunk: DeepAgentChunk | unknown,
): chunk is ["updates", Record<string, unknown>] {
  return (
    Array.isArray(chunk) &&
    chunk[0] === "updates" &&
    !!chunk[1] &&
    typeof chunk[1] === "object"
  );
}
