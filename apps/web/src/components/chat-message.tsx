"use client";

import { motion } from "framer-motion";
import React, { useMemo } from "react";

import type { ContentBlock, ToolArtifact, ToolBlock } from "@loomic/shared";
import { ImagePill } from "./chat/image-lightbox";
import { MarkdownRenderer } from "./chat/markdown-renderer";
import { MentionPill } from "./chat/mention-pill";
import { ThinkingBlockView } from "./chat/thinking-block-view";
import { ToolBlockView } from "./chat/tool-block-view";

// Re-export types for backward compatibility with existing consumers
export type { ContentBlock, ToolArtifact };

/** @deprecated Use ToolBlock from @loomic/shared instead */
export type ToolActivity = ToolBlock;

/* ------------------------------------------------------------------ */
/*  ChatMessage                                                        */
/* ------------------------------------------------------------------ */

type ChatMessageProps = {
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
  isStreaming?: boolean;
};

/**
 * Top-level chat message component.
 *
 * Memoized with a custom comparator: skips re-render when contentBlocks
 * reference and isStreaming flag are unchanged. During streaming, only the
 * actively-streaming message receives new contentBlocks arrays; all prior
 * messages keep the same reference and skip rendering entirely.
 *
 * Sub-components (MarkdownRenderer, ToolBlockView, ThinkingBlockView) are
 * each independently memoized for fine-grained update control.
 */
export const ChatMessage = React.memo(
  function ChatMessage({
    role,
    contentBlocks,
    isStreaming,
  }: ChatMessageProps) {
    const isUser = role === "user";

    if (isUser) {
      return <UserMessage contentBlocks={contentBlocks} />;
    }

    return (
      <AssistantMessage
        contentBlocks={contentBlocks}
        isStreaming={isStreaming ?? false}
      />
    );
  },
  (prev, next) => {
    // Custom comparator: referential equality on contentBlocks is sufficient
    // because updateSessionMessages always creates a new array when content changes
    return (
      prev.role === next.role &&
      prev.contentBlocks === next.contentBlocks &&
      prev.isStreaming === next.isStreaming
    );
  },
);

/* ------------------------------------------------------------------ */
/*  UserMessage                                                        */
/* ------------------------------------------------------------------ */

const UserMessage = React.memo(function UserMessage({
  contentBlocks,
}: {
  contentBlocks: ContentBlock[];
}) {
  // Categorize blocks once per render
  const { text, imageBlocks, mentionBlocks } = useMemo(() => {
    const textParts: string[] = [];
    const images: ContentBlock[] = [];
    const mentions: ContentBlock[] = [];

    for (const block of contentBlocks) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "image") {
        images.push(block);
      } else if (block.type === "mention") {
        mentions.push(block);
      }
    }

    return {
      text: textParts.join(""),
      imageBlocks: images,
      mentionBlocks: mentions,
    };
  }, [contentBlocks]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col items-end gap-2 pl-10"
    >
      {text && (
        <div className="inline-block rounded-xl bg-muted px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground">
          <span className="cursor-text select-text [word-break:break-word]">
            {text}
          </span>
          {mentionBlocks.length > 0 && (
            <span className="inline">
              {mentionBlocks.map((block, idx) => (
                <MentionPill
                  key={idx}
                  label={(block as { label: string }).label}
                  kind={
                    (
                      block as {
                        mentionType: "image-model" | "brand-kit-asset";
                      }
                    ).mentionType
                  }
                />
              ))}
            </span>
          )}
          {imageBlocks.length > 0 && (
            <span className="inline">
              {imageBlocks.map((block, idx) => (
                <ImagePill
                  key={idx}
                  src={(block as { url: string }).url}
                  name={
                    (block as { name?: string }).name ??
                    `image-${idx + 1}`
                  }
                />
              ))}
            </span>
          )}
        </div>
      )}
      {!text && (imageBlocks.length > 0 || mentionBlocks.length > 0) && (
        <div className="inline-block rounded-xl bg-muted px-3 py-2.5">
          {mentionBlocks.map((block, idx) => (
            <MentionPill
              key={`mention-${idx}`}
              label={(block as { label: string }).label}
              kind={
                (
                  block as {
                    mentionType: "image-model" | "brand-kit-asset";
                  }
                ).mentionType
              }
            />
          ))}
          {imageBlocks.map((block, idx) => (
            <ImagePill
              key={idx}
              src={(block as { url: string }).url}
              name={
                (block as { name?: string }).name ?? `image-${idx + 1}`
              }
            />
          ))}
        </div>
      )}
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/*  AssistantMessage                                                    */
/* ------------------------------------------------------------------ */

const AssistantMessage = React.memo(function AssistantMessage({
  contentBlocks,
  isStreaming,
}: {
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
}) {
  // Find the last text block index for streaming cursor placement
  const lastTextIdx = useMemo(() => {
    for (let i = contentBlocks.length - 1; i >= 0; i--) {
      if (contentBlocks[i]!.type === "text") return i;
    }
    return -1;
  }, [contentBlocks]);

  // Show thinking indicator when streaming but no content has arrived yet
  const hasContent = useMemo(
    () =>
      contentBlocks.some(
        (b) =>
          (b.type === "text" && b.text.length > 0) ||
          b.type === "tool" ||
          b.type === "thinking",
      ),
    [contentBlocks],
  );

  const showThinking = isStreaming && !hasContent;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col gap-2 pr-10"
    >
      {showThinking && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>{"\u601d\u8003\u4e2d"}</span>
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      )}
      {contentBlocks.map((block, idx) => {
        if (block.type === "thinking") {
          return (
            <ThinkingBlockView
              key={`thinking-${idx}`}
              thinking={block.thinking}
              isStreaming={
                isStreaming && idx === contentBlocks.length - 1
              }
            />
          );
        }

        if (block.type === "text") {
          const showCursor = isStreaming && idx === lastTextIdx;
          return (
            <MarkdownRenderer
              key={idx}
              text={block.text}
              showCursor={showCursor}
            />
          );
        }

        if (block.type === "tool") {
          return (
            <ToolBlockView key={block.toolCallId} block={block} />
          );
        }

        // ImageBlock -- skip in assistant messages (user-side only)
        return null;
      })}
    </motion.div>
  );
});
