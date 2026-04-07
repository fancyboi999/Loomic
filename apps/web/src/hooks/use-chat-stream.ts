"use client";

import { useCallback } from "react";

import type { StreamEvent, ToolBlock } from "@loomic/shared";
import type { Message } from "./use-chat-sessions";

type MessageUpdater = (
  targetSessionId: string,
  updater: (prev: Message[]) => Message[],
) => void;

/**
 * Extracts the stream event handling logic into a reusable hook.
 * Used by both the main send flow and the reconnection resume flow,
 * eliminating the ~70 lines of duplicated event-handling code.
 */
export function useChatStream(updateSessionMessages: MessageUpdater) {
  /**
   * Apply a single StreamEvent to the assistant message identified by assistantId
   * in the given session. This is the single source of truth for how events
   * mutate the message list.
   *
   * Edge case handling:
   * - Empty deltas are ignored to prevent unnecessary re-renders
   * - Missing assistantId in message list is tolerated (logged, not thrown)
   * - Duplicate tool.started events for the same toolCallId are safely deduplicated
   * - Unknown event types from newer server versions are silently ignored
   */
  const applyStreamEvent = useCallback(
    (event: StreamEvent, assistantId: string, sessionId: string) => {
      if (!assistantId || !sessionId) {
        console.warn("[chat-stream] applyStreamEvent called with missing ids:", {
          assistantId,
          sessionId,
          eventType: event.type,
        });
        return;
      }

      const update = (updater: (prev: Message[]) => Message[]) =>
        updateSessionMessages(sessionId, updater);

      switch (event.type) {
        case "message.delta": {
          // Skip truly empty deltas -- they cause unnecessary re-renders
          const delta = event.delta;
          if (delta === undefined || delta === null) break;

          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "text") {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + delta,
                };
              } else {
                blocks.push({ type: "text", text: delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;
        }

        case "thinking.delta": {
          const delta = event.delta;
          if (delta === undefined || delta === null) break;

          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "thinking") {
                blocks[blocks.length - 1] = {
                  ...last,
                  thinking: last.thinking + delta,
                };
              } else {
                blocks.push({ type: "thinking", thinking: delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;
        }

        case "tool.started":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // Guard against duplicate tool.started events for the same toolCallId
              const alreadyExists = m.contentBlocks.some(
                (b) => b.type === "tool" && b.toolCallId === event.toolCallId,
              );
              if (alreadyExists) {
                console.warn("[chat-stream] duplicate tool.started for:", event.toolCallId);
                return m;
              }
              const newBlock: ToolBlock = {
                type: "tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "running",
                ...(event.input ? { input: event.input } : {}),
              };
              return {
                ...m,
                contentBlocks: [...m.contentBlocks, newBlock],
              };
            }),
          );
          break;

        case "tool.completed":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              return {
                ...m,
                contentBlocks: m.contentBlocks.map((block) => {
                  if (
                    block.type === "tool" &&
                    block.toolCallId === event.toolCallId
                  ) {
                    return {
                      ...block,
                      status: "completed" as const,
                      output: event.output,
                      outputSummary: event.outputSummary,
                      ...(event.artifacts
                        ? { artifacts: event.artifacts }
                        : {}),
                    };
                  }
                  return block;
                }),
              };
            }),
          );
          break;

        case "run.failed":
          console.error("[chat-stream] run.failed:", event.error);
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // Mark all running tool blocks as completed so spinners stop
              const blocks = m.contentBlocks.map((block) =>
                block.type === "tool" && block.status === "running"
                  ? { ...block, status: "completed" as const, outputSummary: "\u5904\u7406\u5931\u8d25" }
                  : block,
              );
              const hasText = blocks.some((b) => b.type === "text");
              return {
                ...m,
                contentBlocks: hasText
                  ? blocks
                  : [
                      ...blocks,
                      {
                        type: "text" as const,
                        text: "\u62b1\u6b49\uff0c\u5904\u7406\u8fc7\u7a0b\u4e2d\u9047\u5230\u95ee\u9898\uff0c\u8bf7\u91cd\u8bd5\u3002",
                      },
                    ],
              };
            }),
          );
          break;

        case "run.canceled":
          // Clean up running tool blocks when run is aborted (e.g. billing error)
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const hasRunning = m.contentBlocks.some(
                (b) => b.type === "tool" && b.status === "running",
              );
              if (!hasRunning) return m;
              return {
                ...m,
                contentBlocks: m.contentBlocks.map((block) =>
                  block.type === "tool" && block.status === "running"
                    ? { ...block, status: "completed" as const }
                    : block,
                ),
              };
            }),
          );
          break;

        default:
          // Unknown event types are silently ignored -- new event types may be
          // added server-side before the frontend is updated
          break;
      }
    },
    [updateSessionMessages],
  );

  return { applyStreamEvent };
}
