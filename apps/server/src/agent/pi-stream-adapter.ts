import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { imageArtifactSchema, videoArtifactSchema, type StreamEvent, type ToolArtifact } from "@loomic/shared";

import { sanitizeErrorForClient } from "../utils/error-sanitizer.js";

export async function* adaptPiAgentStream(options: {
  conversationId: string;
  now?: () => string;
  runId: string;
  sessionId: string;
  signal?: AbortSignal;
  stream: AsyncIterable<AgentEvent>;
}): AsyncGenerator<StreamEvent> {
  const now = options.now ?? (() => new Date().toISOString());
  let messageNumber = 0;
  let messageId = `message_${options.runId}_0`;
  let streamedText = false;
  let terminal: StreamEvent | undefined;

  yield {
    type: "run.started",
    runId: options.runId,
    sessionId: options.sessionId,
    conversationId: options.conversationId,
    timestamp: now(),
  };

  if (options.signal?.aborted) {
    yield { type: "run.canceled", runId: options.runId, timestamp: now() };
    return;
  }

  try {
    for await (const event of options.stream) {
      if (options.signal?.aborted) {
        terminal = { type: "run.canceled", runId: options.runId, timestamp: now() };
        break;
      }
      if (event.type === "message_start" && event.message.role === "assistant") {
        messageId = `message_${options.runId}_${++messageNumber}`;
        streamedText = false;
      }
      if (event.type === "message_update") {
        const delta = event.assistantMessageEvent;
        if (delta.type === "text_delta" && delta.delta) {
          streamedText = true;
          yield { type: "message.delta", runId: options.runId, messageId, delta: delta.delta, timestamp: now() };
        } else if (delta.type === "thinking_delta" && delta.delta) {
          yield { type: "thinking.delta", runId: options.runId, messageId, delta: delta.delta, timestamp: now() };
        }
      }
      if (event.type === "message_end" && event.message.role === "assistant") {
        if (event.message.stopReason === "error") {
          terminal = { type: "run.failed", runId: options.runId, timestamp: now(), error: { code: "run_failed", message: sanitizeErrorForClient(event.message.errorMessage ?? "Agent failed") } };
        } else if (event.message.stopReason === "aborted") {
          terminal = { type: "run.canceled", runId: options.runId, timestamp: now() };
        } else if (!streamedText && event.message.content.every((part) => part.type !== "toolCall")) {
          const text = event.message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
          if (text) yield { type: "message.delta", runId: options.runId, messageId, delta: text, timestamp: now() };
        }
      }
      if (event.type === "tool_execution_start") {
        const input = event.args && typeof event.args === "object" && !Array.isArray(event.args)
          ? event.args as Record<string, unknown>
          : undefined;
        yield {
          type: "tool.started", runId: options.runId, timestamp: now(),
          toolCallId: event.toolCallId, toolName: event.toolName,
          ...(input ? { input } : {}),
        };
      }
      if (event.type === "tool_execution_end") {
        const result = event.result as { content?: Array<{ type: string; text?: string }> };
        const text = result.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? "";
        const parsed = parseObject(text);
        const artifacts = extractArtifacts(parsed);
        const output = parsed ? { ...parsed } : undefined;
        if (output && artifacts) {
          for (const key of ARTIFACT_KEYS) delete output[key];
        }
        const outputSummary = typeof parsed?.summary === "string" ? parsed.summary : text.slice(0, 200);
        yield {
          type: "tool.completed", runId: options.runId, timestamp: now(),
          toolCallId: event.toolCallId, toolName: event.toolName,
          ...(output && JSON.stringify(output).length <= 10240 ? { output } : {}),
          ...(outputSummary ? { outputSummary } : {}),
          ...(artifacts ? { artifacts } : {}),
        };
        if (event.toolName === "manipulate_canvas") {
          yield { type: "canvas.sync", runId: options.runId, timestamp: now() };
        }
      }
    }
  } catch (error) {
    terminal = options.signal?.aborted
      ? { type: "run.canceled", runId: options.runId, timestamp: now() }
      : { type: "run.failed", runId: options.runId, timestamp: now(), error: { code: "run_failed", message: sanitizeErrorForClient(error) } };
  }
  yield terminal ?? { type: "run.completed", runId: options.runId, timestamp: now() };
}

const ARTIFACT_KEYS = ["url", "imageUrl", "screenshotUrl", "videoUrl", "durationSeconds", "mimeType", "width", "height", "placement"];

function parseObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function extractArtifacts(record?: Record<string, unknown>): ToolArtifact[] | undefined {
  if (!record) return undefined;
  const artifacts: ToolArtifact[] = [];
  const placement = record.placement && typeof record.placement === "object" ? record.placement : undefined;
  const imageUrl = record.url ?? record.imageUrl ?? record.screenshotUrl;
  if (typeof imageUrl === "string" && imageUrl.length > 0) {
    const screenshot = typeof record.screenshotUrl === "string";
    const candidate = imageArtifactSchema.safeParse({
      type: "image", url: imageUrl,
      mimeType: record.mimeType ?? "image/png",
      width: record.width ?? (placement as any)?.width ?? (screenshot ? 1024 : 512),
      height: record.height ?? (placement as any)?.height ?? (screenshot ? 1024 : 512),
      ...(record.title ? { title: record.title } : {}),
      ...(placement ? { placement } : {}),
    });
    if (candidate.success) artifacts.push(candidate.data);
  }
  if (typeof record.videoUrl === "string" && record.videoUrl.length > 0) {
    const candidate = videoArtifactSchema.safeParse({
      type: "video", url: record.videoUrl,
      mimeType: record.mimeType ?? "video/mp4",
      width: record.width ?? 1280,
      height: record.height ?? 720,
      ...(typeof record.durationSeconds === "number" ? { durationSeconds: record.durationSeconds } : {}),
      ...(typeof record.title === "string" ? { title: record.title.slice(0, 120) }
        : typeof record.prompt === "string" ? { title: record.prompt.slice(0, 200) }
          : typeof record.summary === "string" ? { title: record.summary.slice(0, 100) } : {}),
      ...(placement ? { placement } : {}),
    });
    if (candidate.success) artifacts.push(candidate.data);
  }
  return artifacts.length ? artifacts : undefined;
}
