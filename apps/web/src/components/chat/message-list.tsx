"use client";

import React, { useRef, useEffect, useCallback } from "react";

import type { Message } from "../../hooks/use-chat-sessions";
import { ChatMessage } from "../chat-message";
import { ChatSkills } from "../chat-skills";
import { ErrorBoundary } from "../error-boundary";
import { MessageErrorBoundary } from "./message-error-boundary";

type MessageListProps = {
  messages: Message[];
  streaming: boolean;
  sessionsLoading: boolean;
  messagesLoading: boolean;
  onSend: (message: string) => void;
};

/**
 * Scrollable message list with auto-scroll, loading states, and per-message
 * error boundaries.
 *
 * Extracted from ChatSidebar to:
 * 1. Reduce ChatSidebar's rendering surface during streaming
 * 2. Isolate the scroll container's layout calculations
 * 3. Enable independent memoization of the message list
 *
 * Performance notes:
 * - Each ChatMessage is individually wrapped in MessageErrorBoundary so a
 *   single broken message doesn't crash the entire chat
 * - The component itself is memoized; during streaming only the last
 *   message's contentBlocks change, so prior messages skip re-render
 *   thanks to ChatMessage's internal React.memo
 */
export const MessageList = React.memo(function MessageList({
  messages,
  streaming,
  sessionsLoading,
  messagesLoading,
  onSend,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming updates
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <ErrorBoundary
      onError={(err) =>
        console.error("[chat-sidebar] message area render crashed:", err)
      }
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-6 px-4 py-4">
        {sessionsLoading || messagesLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <ChatSkills onSend={onSend} />
        ) : (
          messages.map((msg, index) => {
            // Only the last assistant message during streaming gets the
            // isStreaming flag -- all others are settled and fully memoized
            const isLastMessage = index === messages.length - 1;
            const isStreamingMessage =
              streaming && msg.role === "assistant" && isLastMessage;

            return (
              <MessageErrorBoundary key={msg.id} messageId={msg.id}>
                <ChatMessage
                  role={msg.role}
                  contentBlocks={msg.contentBlocks}
                  isStreaming={isStreamingMessage}
                />
              </MessageErrorBoundary>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </ErrorBoundary>
  );
});
