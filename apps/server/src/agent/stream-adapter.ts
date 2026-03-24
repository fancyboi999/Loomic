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

/**
 * Shape of a LangChain v2 stream event from `streamEvents()`.
 */
type LangChainStreamEvent = {
  event: string;
  name?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  run_id?: string;
  tags?: string[];
};

type AdaptDeepAgentStreamOptions = {
  conversationId: string;
  now?: () => string;
  runId: string;
  sessionId: string;
  signal?: AbortSignal;
  stream: AsyncIterable<LangChainStreamEvent | unknown>;
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
    for await (const rawEvent of options.stream) {
      if (options.signal?.aborted) {
        yield canceledEvent(options.runId, now);
        return;
      }

      if (!isStreamEvent(rawEvent)) {
        continue;
      }

      const evt = rawEvent;

      // Per-token streaming from the chat model
      if (evt.event === "on_chat_model_stream") {
        const chunk = evt.data?.chunk;
        if (!chunk) continue;

        // Skip chunks that are tool calls (no text to emit)
        if (
          AIMessageChunkClass.isInstance(chunk) ||
          AIMessageClass.isInstance(chunk)
        ) {
          const msg = chunk as AIMessageChunk | AIMessage;
          if ((msg.tool_calls?.length ?? 0) > 0) continue;
        }

        const delta = extractChunkText(chunk);
        if (!delta) continue;

        yield {
          delta,
          messageId:
            (chunk as { id?: string }).id ?? `message_${options.runId}`,
          runId: options.runId,
          timestamp: now(),
          type: "message.delta",
        };
        continue;
      }

      // Fallback: complete message from non-streaming model (on_chat_model_end)
      if (evt.event === "on_chat_model_end") {
        const output = evt.data?.output;
        if (!output) continue;

        if (
          AIMessageClass.isInstance(output) ||
          AIMessageChunkClass.isInstance(output)
        ) {
          const msg = output as AIMessage | AIMessageChunk;

          // Skip if this was a tool call message (tool lifecycle via on_tool_*)
          if ((msg.tool_calls?.length ?? 0) > 0) continue;

          const delta = extractChunkText(msg);
          if (!delta) continue;

          yield {
            delta,
            messageId: msg.id ?? `message_${options.runId}`,
            runId: options.runId,
            timestamp: now(),
            type: "message.delta",
          };
        }
        continue;
      }

      // Tool execution started
      if (evt.event === "on_tool_start") {
        const toolName = evt.name ?? "unknown_tool";
        // Use run_id as the tool call identifier for consistent start/end pairing
        const toolCallId = readString(evt.run_id) ?? `tool_${Date.now()}`;

        if (seenStartedToolCalls.has(toolCallId)) continue;
        seenStartedToolCalls.add(toolCallId);

        yield {
          runId: options.runId,
          timestamp: now(),
          toolCallId,
          toolName,
          type: "tool.started",
        };
        continue;
      }

      // Tool execution completed
      if (evt.event === "on_tool_end") {
        const toolName = evt.name ?? "unknown_tool";
        // Use run_id for consistent pairing with on_tool_start
        const toolCallId = readString(evt.run_id) ?? `tool_${Date.now()}`;

        if (seenCompletedToolCalls.has(toolCallId)) continue;
        seenCompletedToolCalls.add(toolCallId);

        const output = evt.data?.output;
        yield {
          outputSummary: summarizeOutput(output),
          runId: options.runId,
          timestamp: now(),
          toolCallId,
          toolName,
          type: "tool.completed",
        };
        continue;
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

/**
 * Extract text from a chat model stream chunk.
 */
function extractChunkText(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";

  // AIMessageChunk / AIMessage with string content
  if ("content" in chunk) {
    const content = (chunk as { content: unknown }).content;
    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
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
  }

  return "";
}

function summarizeOutput(output: unknown): string | undefined {
  if (ToolMessageClass.isInstance(output)) {
    const textContent = extractChunkText(output);
    const parsed = tryParseJson(textContent);
    if (
      parsed &&
      typeof parsed === "object" &&
      "summary" in parsed &&
      typeof parsed.summary === "string"
    ) {
      return parsed.summary;
    }
    return textContent || undefined;
  }

  if (output && typeof output === "object") {
    const serialized = JSON.stringify(output);
    const parsed = tryParseJson(serialized);
    if (
      parsed &&
      typeof parsed === "object" &&
      "summary" in parsed &&
      typeof parsed.summary === "string"
    ) {
      return parsed.summary;
    }
    return serialized.length > 200
      ? `${serialized.slice(0, 197)}...`
      : serialized;
  }

  if (typeof output === "string") return output || undefined;
  return undefined;
}

function tryParseJson(value: unknown) {
  if (typeof value !== "string") return null;
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

function isStreamEvent(value: unknown): value is LangChainStreamEvent {
  return (
    value !== null &&
    typeof value === "object" &&
    "event" in value &&
    typeof (value as { event: unknown }).event === "string"
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}


/**
 * Extract tool_call_id from streamEvents metadata or data.
 * LangChain stores it in metadata.tool_call_id or data.input.tool_call_id.
 */
function extractToolCallId(evt: LangChainStreamEvent): string | undefined {
  // Check metadata first (most reliable)
  const metaId = readString(
    (evt.metadata as Record<string, unknown> | undefined)?.tool_call_id,
  );
  if (metaId) return metaId;

  // Check if the output is a ToolMessage with tool_call_id
  if (evt.data?.output && ToolMessageClass.isInstance(evt.data.output)) {
    const id = readString((evt.data.output as ToolMessage).tool_call_id);
    if (id) return id;
  }

  return undefined;
}
