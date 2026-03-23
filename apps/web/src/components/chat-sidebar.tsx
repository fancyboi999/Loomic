"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StreamEvent } from "@loomic/shared";
import { createRun } from "../lib/server-api";
import { streamEvents } from "../lib/stream-events";
import { ChatInput } from "./chat-input";
import { ChatMessage, type ToolActivity } from "./chat-message";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivities?: ToolActivity[] | undefined;
};

type ChatSidebarProps = {
  canvasId: string;
  open: boolean;
  onToggle: () => void;
};

export function ChatSidebar({ canvasId, open, onToggle }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleStreamEvent = useCallback(
    (event: StreamEvent, assistantId: string) => {
      switch (event.type) {
        case "message.delta":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + event.delta }
                : m,
            ),
          );
          break;

        case "tool.started":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolActivities: [
                      ...(m.toolActivities ?? []),
                      {
                        toolCallId: event.toolCallId,
                        toolName: event.toolName,
                        status: "running" as const,
                      },
                    ],
                  }
                : m,
            ),
          );
          break;

        case "tool.completed":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolActivities: m.toolActivities?.map((t) =>
                      t.toolCallId === event.toolCallId
                        ? { ...t, status: "completed" as const, outputSummary: event.outputSummary }
                        : t,
                    ),
                  }
                : m,
            ),
          );
          break;

        case "run.failed":
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content
                ? { ...m, content: `Error: ${event.error.message}` }
                : m,
            ),
          );
          break;
      }
    },
    [],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (streaming) return;

      // Add user message
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Create assistant placeholder
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStreaming(true);
      abortRef.current = false;

      try {
        const sessionId = `session-${canvasId}`;
        const run = await createRun({
          sessionId,
          conversationId: canvasId,
          prompt: text,
        });

        for await (const event of streamEvents(run.runId)) {
          if (abortRef.current) break;
          handleStreamEvent(event, assistantId);
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || "Failed to get response." }
              : m,
          ),
        );
      } finally {
        setStreaming(false);
      }
    },
    [streaming, canvasId, handleStreamEvent],
  );

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-4 z-50 rounded-lg bg-background border border-border px-3 py-2 text-sm shadow-md hover:bg-muted"
      >
        Chat
      </button>
    );
  }

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <button
          onClick={onToggle}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Start a conversation with the AI assistant.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            toolActivities={msg.toolActivities}
            isStreaming={streaming && msg.role === "assistant" && msg === messages[messages.length - 1]}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
