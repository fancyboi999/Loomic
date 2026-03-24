"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessage as ChatMessageData,
  ChatSessionSummary,
  ImageArtifact,
  StreamEvent,
} from "@loomic/shared";
import {
  createRun,
  createSession,
  deleteSession as deleteSessionApi,
  fetchMessages,
  fetchSessions,
  saveMessage,
  updateSessionTitle,
} from "../lib/server-api";
import { streamEvents } from "../lib/stream-events";
import { ChatInput } from "./chat-input";
import { ChatMessage, type ToolActivity } from "./chat-message";
import { SessionSelector } from "./session-selector";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivities?: ToolActivity[] | undefined;
};

type ChatSidebarProps = {
  accessToken: string;
  canvasId: string;
  open: boolean;
  onToggle: () => void;
  onImageGenerated?: (artifact: ImageArtifact) => void;
};

function mapServerMessages(serverMessages: ChatMessageData[]): Message[] {
  return serverMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    ...(m.toolActivities
      ? { toolActivities: m.toolActivities as ToolActivity[] }
      : {}),
  }));
}

export function ChatSidebar({
  accessToken,
  canvasId,
  open,
  onToggle,
  onImageGenerated,
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load sessions on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setSessionsLoading(true);
      try {
        const res = await fetchSessions(accessToken, canvasId);
        if (cancelled) return;

        if (res.sessions.length > 0) {
          setSessions(res.sessions);
          const mostRecent = res.sessions[0]!;
          setActiveSessionId(mostRecent.id);
          const msgRes = await fetchMessages(accessToken, mostRecent.id);
          if (cancelled) return;
          setMessages(mapServerMessages(msgRes.messages));
        } else {
          const created = await createSession(accessToken, canvasId);
          if (cancelled) return;
          setSessions([created.session]);
          setActiveSessionId(created.session.id);
          setMessages([]);
        }
      } catch {
        // Session loading failed — remain in empty state
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasId]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current || streaming) return;
      setActiveSessionId(sessionId);
      setMessages([]);
      try {
        const msgRes = await fetchMessages(
          accessTokenRef.current,
          sessionId,
        );
        setMessages(mapServerMessages(msgRes.messages));
      } catch {
        // Messages will remain empty
      }
    },
    [streaming],
  );

  const handleNewChat = useCallback(async () => {
    if (streaming) return;
    try {
      const res = await createSession(accessTokenRef.current, canvasId);
      setSessions((prev) => [res.session, ...prev]);
      setActiveSessionId(res.session.id);
      setMessages([]);
    } catch {
      // Silently fail
    }
  }, [canvasId, streaming]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (streaming) return;
      try {
        await deleteSessionApi(accessTokenRef.current, sessionId);
        const remaining = sessionsRef.current.filter(
          (s) => s.id !== sessionId,
        );

        if (remaining.length === 0) {
          const res = await createSession(accessTokenRef.current, canvasId);
          setSessions([res.session]);
          setActiveSessionId(res.session.id);
          setMessages([]);
        } else {
          setSessions(remaining);
          if (sessionId === activeSessionIdRef.current) {
            const next = remaining[0]!;
            setActiveSessionId(next.id);
            try {
              const msgRes = await fetchMessages(
                accessTokenRef.current,
                next.id,
              );
              setMessages(mapServerMessages(msgRes.messages));
            } catch {
              setMessages([]);
            }
          }
        }
      } catch {
        // Silently fail
      }
    },
    [canvasId, streaming],
  );

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
                        ? {
                            ...t,
                            status: "completed" as const,
                            outputSummary: event.outputSummary,
                            ...(event.artifacts
                              ? { artifacts: event.artifacts }
                              : {}),
                          }
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
      const currentSessionId = activeSessionIdRef.current;
      if (streaming || !currentSessionId) return;

      const isFirstMessage = messagesRef.current.length === 0;

      // Add user message locally
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Persist user message (fire-and-forget)
      void saveMessage(accessTokenRef.current, currentSessionId, {
        role: "user",
        content: text,
      });

      // Auto-title from first user message
      if (isFirstMessage) {
        const title = text.length > 50 ? `${text.slice(0, 47)}...` : text;
        void updateSessionTitle(
          accessTokenRef.current,
          currentSessionId,
          title,
        );
        setSessions((prev) =>
          prev.map((s) =>
            s.id === currentSessionId ? { ...s, title } : s,
          ),
        );
      }

      // Create assistant placeholder
      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);
      setStreaming(true);
      abortRef.current = false;

      try {
        const run = await createRun({
          sessionId: `session-${canvasId}`,
          conversationId: canvasId,
          prompt: text,
        });

        let assistantContent = "";
        let assistantTools: ToolActivity[] | undefined;

        for await (const event of streamEvents(run.runId)) {
          if (abortRef.current) break;
          handleStreamEvent(event, assistantId);

          if (event.type === "message.delta") {
            assistantContent += event.delta;
          }
          if (event.type === "tool.started") {
            assistantTools ??= [];
            assistantTools.push({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: "running",
            });
          }
          if (event.type === "tool.completed" && assistantTools) {
            const tool = assistantTools.find(
              (t) => t.toolCallId === event.toolCallId,
            );
            if (tool) {
              tool.status = "completed";
              tool.outputSummary = event.outputSummary;
              if (event.artifacts) {
                (tool as any).artifacts = event.artifacts;
              }
            }

            // Fire canvas insertion callback for image artifacts
            if (event.artifacts && onImageGenerated) {
              for (const artifact of event.artifacts) {
                if (artifact.type === "image") {
                  onImageGenerated(artifact as ImageArtifact);
                }
              }
            }
          }
        }

        // Persist assistant message (fire-and-forget)
        if (assistantContent) {
          void saveMessage(accessTokenRef.current, currentSessionId, {
            role: "assistant",
            content: assistantContent,
            ...(assistantTools ? { toolActivities: assistantTools } : {}),
          });
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
    [streaming, canvasId, handleStreamEvent, onImageGenerated],
  );

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-2 text-xs font-medium shadow-lg hover:opacity-90 transition-opacity"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path
            fillOpacity={0.9}
            d="M18.25 3A3.75 3.75 0 0 1 22 6.75v9a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM5.75 4.5A2.25 2.25 0 0 0 3.5 6.75v9A2.25 2.25 0 0 0 5.75 18h2.901c.412 0 .81.145 1.125.41l2.065 1.73a.25.25 0 0 0 .32 0l2.099-1.738A1.75 1.75 0 0 1 15.376 18h2.874a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25z"
          />
        </svg>
        Chat
      </button>
    );
  }

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col bg-white">
      {/* Header */}
      <div className="flex min-h-[48px] items-center justify-between pl-4 pr-2">
        <div className="flex items-center gap-1 min-w-0">
          <h2 className="text-sm font-semibold text-[#2F3640] shrink-0">Chat</h2>
          {!sessionsLoading && (
            <SessionSelector
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={handleSelectSession}
              onNewChat={handleNewChat}
              onDelete={handleDeleteSession}
            />
          )}
        </div>
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-[#A4A9B2] hover:bg-[#F5F5F5] hover:text-[#2F3640] transition-colors shrink-0"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-6 px-4 py-4">
        {sessionsLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#E3E3E3] border-t-[#2F3640]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <svg className="h-10 w-10 text-[#E3E3E3]" viewBox="0 0 24 24" fill="currentColor">
              <path
                fillOpacity={0.9}
                d="M18.25 3A3.75 3.75 0 0 1 22 6.75v9a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM5.75 4.5A2.25 2.25 0 0 0 3.5 6.75v9A2.25 2.25 0 0 0 5.75 18h2.901c.412 0 .81.145 1.125.41l2.065 1.73a.25.25 0 0 0 .32 0l2.099-1.738A1.75 1.75 0 0 1 15.376 18h2.874a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25z"
              />
            </svg>
            <p className="text-sm text-[#A4A9B2]">
              Start a conversation
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              toolActivities={msg.toolActivities}
              isStreaming={
                streaming &&
                msg.role === "assistant" &&
                msg === messages[messages.length - 1]
              }
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={streaming || sessionsLoading} />
    </div>
  );
}
