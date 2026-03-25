"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessage as ChatMessageData,
  ChatSessionSummary,
  ContentBlock,
  ImageArtifact,
  StreamEvent,
  TextBlock,
  ToolBlock,
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
import { ChatMessage } from "./chat-message";
import { ChatSkills } from "./chat-skills";
import { SessionSelector } from "./session-selector";

type Message = {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
};

type ChatSidebarProps = {
  accessToken: string;
  canvasId: string;
  open: boolean;
  onToggle: () => void;
  onImageGenerated?: (artifact: ImageArtifact) => void;
};

function mapServerMessages(serverMessages: ChatMessageData[]): Message[] {
  return serverMessages.map((m) => {
    // Prefer contentBlocks if present; otherwise synthesize from legacy fields
    let blocks: ContentBlock[];
    if (m.contentBlocks && m.contentBlocks.length > 0) {
      blocks = m.contentBlocks;
    } else {
      blocks = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      if (m.toolActivities) {
        for (const ta of m.toolActivities) {
          blocks.push({
            type: "tool",
            toolCallId: ta.toolCallId,
            toolName: ta.toolName,
            status: ta.status as "running" | "completed",
            ...(ta.outputSummary ? { outputSummary: ta.outputSummary } : {}),
            ...(ta.artifacts ? { artifacts: ta.artifacts } : {}),
          });
        }
      }
    }
    return {
      id: m.id,
      role: m.role,
      contentBlocks: blocks,
    };
  });
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

  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizing = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(600, Math.max(300, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load sessions on mount (accessTokenRef avoids tab-switch reload)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const token = accessTokenRef.current;
      setSessionsLoading(true);
      try {
        const res = await fetchSessions(token, canvasId);
        if (cancelled) return;

        if (res.sessions.length > 0) {
          setSessions(res.sessions);
          const mostRecent = res.sessions[0]!;
          setActiveSessionId(mostRecent.id);
          const msgRes = await fetchMessages(token, mostRecent.id);
          if (cancelled) return;
          setMessages(mapServerMessages(msgRes.messages));
        } else {
          const created = await createSession(token, canvasId);
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
  }, [canvasId]);

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
      } catch (err) {
        console.error("[chat] Failed to load session messages:", err);
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

        case "tool.started":
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const newBlock: ToolBlock = {
                type: "tool",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                status: "running",
              };
              return {
                ...m,
                contentBlocks: [...m.contentBlocks, newBlock],
              };
            }),
          );
          break;

        case "tool.completed":
          setMessages((prev) =>
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
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const hasText = m.contentBlocks.some((b) => b.type === "text");
              if (hasText) return m;
              return {
                ...m,
                contentBlocks: [
                  ...m.contentBlocks,
                  { type: "text" as const, text: `Error: ${event.error.message}` },
                ],
              };
            }),
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
        contentBlocks: [{ type: "text", text }],
      };
      setMessages((prev) => [...prev, userMsg]);

      // Persist user message (fire-and-forget with error logging)
      saveMessage(accessTokenRef.current, currentSessionId, {
        role: "user",
        content: text,
        contentBlocks: [{ type: "text", text }],
      }).catch((err) => console.error("[chat] Failed to save user message:", err));

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
        { id: assistantId, role: "assistant", contentBlocks: [] },
      ]);
      setStreaming(true);
      abortRef.current = false;

      try {
        const run = await createRun(
          {
            sessionId: currentSessionId,
            conversationId: canvasId,
            prompt: text,
            canvasId,
          },
          {
            accessToken: accessTokenRef.current,
          },
        );

        for await (const event of streamEvents(run.runId)) {
          if (abortRef.current) break;
          handleStreamEvent(event, assistantId);

          // Fire canvas insertion callback for image artifacts.
          // Only use artifacts that include placement (from the sub-agent
          // response). Inner tool results (generate_image) lack placement
          // and would cause a duplicate insertion at viewport center.
          if (
            event.type === "tool.completed" &&
            event.artifacts &&
            onImageGenerated
          ) {
            for (const artifact of event.artifacts) {
              if (artifact.type === "image" && artifact.placement) {
                onImageGenerated(artifact as ImageArtifact);
              }
            }
          }
        }

        // Derive flat content + full blocks from the final message state
        const finalMsg = messagesRef.current.find(
          (m) => m.id === assistantId,
        );
        const finalBlocks = finalMsg?.contentBlocks ?? [];
        const flatContent = finalBlocks
          .filter((b): b is TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        // Persist assistant message (fire-and-forget with error logging)
        if (flatContent || finalBlocks.length > 0) {
          saveMessage(accessTokenRef.current, currentSessionId, {
            role: "assistant",
            content: flatContent,
            contentBlocks: finalBlocks,
          }).catch((err) => console.error("[chat] Failed to save assistant message:", err));
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const hasText = m.contentBlocks.some((b) => b.type === "text");
            if (hasText) return m;
            return {
              ...m,
              contentBlocks: [
                ...m.contentBlocks,
                { type: "text" as const, text: "Failed to get response." },
              ],
            };
          }),
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
    <div className="flex h-full shrink-0" style={{ width: sidebarWidth }}>
      {/* Resize handle */}
      <div
        className="w-2 shrink-0 cursor-col-resize bg-gradient-to-r from-transparent via-[#D7DCE3] to-transparent shadow-[1px_0_10px_rgba(15,23,42,0.06)] transition-all hover:via-[#BBC3CD] hover:shadow-[1px_0_14px_rgba(15,23,42,0.1)] active:via-[#9EA8B5] active:shadow-[1px_0_16px_rgba(15,23,42,0.14)]"
        onMouseDown={handleMouseDown}
      />
      <div className="flex flex-1 flex-col bg-white min-w-0">
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
            <ChatSkills onSend={handleSend} />
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                contentBlocks={msg.contentBlocks}
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
    </div>
  );
}
