"use client";

import { useCallback } from "react";

import type { ContentBlock, StreamEvent, ToolBlock } from "@loomic/shared";
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
   */
  const applyStreamEvent = useCallback(
    (event: StreamEvent, assistantId: string, sessionId: string) => {
      const update = (updater: (prev: Message[]) => Message[]) =>
        updateSessionMessages(sessionId, updater);

      switch (event.type) {
        case "message.delta":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "text") {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + event.delta,
                };
              } else {
                blocks.push({ type: "text", text: event.delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;

        case "thinking.delta":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const blocks = [...m.contentBlocks];
              const last = blocks[blocks.length - 1];
              if (last && last.type === "thinking") {
                blocks[blocks.length - 1] = {
                  ...last,
                  thinking: last.thinking + event.delta,
                };
              } else {
                blocks.push({ type: "thinking", thinking: event.delta });
              }
              return { ...m, contentBlocks: blocks };
            }),
          );
          break;

        case "tool.started":
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
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
          update((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // Mark all running tool blocks as completed so spinners stop
              const blocks = m.contentBlocks.map((block) =>
                block.type === "tool" && block.status === "running"
                  ? { ...block, status: "completed" as const, outputSummary: event.error.message }
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
                        text: `Error: ${event.error.message}`,
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
      }
    },
    [updateSessionMessages],
  );

  return { applyStreamEvent };
}
