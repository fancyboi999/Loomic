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
import type { ReadyAttachment } from "../hooks/use-image-attachments";
import type { WebSocketHandle } from "../hooks/use-websocket";
import {
  createSession,
  deleteSession as deleteSessionApi,
  fetchMessages,
  fetchSessions,
  saveMessage,
  updateSessionTitle,
} from "../lib/server-api";
import { useImageAttachments } from "../hooks/use-image-attachments";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { INITIAL_ATTACHMENTS_KEY } from "../hooks/use-create-project";
import { CanvasImagePicker, type CanvasImageItem } from "./canvas-image-picker";
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
  onCanvasSync?: () => void;
  initialPrompt?: string | undefined;
  initialSessionId?: string | undefined;
  onSessionChange?: (sessionId: string) => void;
  onRequestCanvasImages?: () => CanvasImageItem[];
  ws: WebSocketHandle;
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
            ...(ta.input ? { input: ta.input } : {}),
            ...(ta.output ? { output: ta.output } : {}),
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
  onCanvasSync,
  initialPrompt,
  initialSessionId,
  onSessionChange,
  onRequestCanvasImages,
  ws,
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const chatInputRef = useRef<import("./chat-input").ChatInputHandle>(null);

  const initialPromptSent = useRef(false);
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

  const {
    attachments: imageAttachments,
    addFiles,
    addCanvasRef,
    retryUpload,
    removeAttachment,
    clearAll: clearAttachments,
    isUploading,
    readyAttachments,
  } = useImageAttachments(accessToken);

  const { activeImageModel } = useImageModelPreference();
  const activeImageModelRef = useRef(activeImageModel);
  activeImageModelRef.current = activeImageModel;

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

  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

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
          // Restore session from URL if available, otherwise use most recent
          const target = initialSessionId
            ? res.sessions.find((s) => s.id === initialSessionId) ?? res.sessions[0]!
            : res.sessions[0]!;
          setActiveSessionId(target.id);
          onSessionChangeRef.current?.(target.id);
          const msgRes = await fetchMessages(token, target.id);
          if (cancelled) return;
          setMessages(mapServerMessages(msgRes.messages));
        } else {
          const created = await createSession(token, canvasId);
          if (cancelled) return;
          setSessions([created.session]);
          setActiveSessionId(created.session.id);
          onSessionChangeRef.current?.(created.session.id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current || streaming) return;
      setActiveSessionId(sessionId);
      onSessionChangeRef.current?.(sessionId);
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
      onSessionChangeRef.current?.(res.session.id);
      setMessages([]);
    } catch {
      // Silently fail
    }
  }, [canvasId, streaming]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (streaming) return;
      const token = accessTokenRef.current;
      const remaining = sessionsRef.current.filter(
        (s) => s.id !== sessionId,
      );

      // Optimistic UI update — remove immediately
      if (remaining.length === 0) {
        // Create new session first (need its ID before updating UI)
        try {
          const res = await createSession(token, canvasId);
          setSessions([res.session]);
          setActiveSessionId(res.session.id);
          onSessionChangeRef.current?.(res.session.id);
          setMessages([]);
        } catch {
          return; // Can't proceed without a replacement session
        }
      } else {
        setSessions(remaining);
        if (sessionId === activeSessionIdRef.current) {
          const next = remaining[0]!;
          setActiveSessionId(next.id);
          onSessionChangeRef.current?.(next.id);
          fetchMessages(token, next.id)
            .then((msgRes) => setMessages(mapServerMessages(msgRes.messages)))
            .catch(() => setMessages([]));
        }
      }

      // Delete in background — don't block UI
      deleteSessionApi(token, sessionId).catch(() => {
        // If delete failed, re-fetch sessions to restore truth
        fetchSessions(token, canvasId)
          .then((res) => setSessions(res.sessions))
          .catch(() => {});
      });
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
    async (text: string, attachmentsOverride?: ReadyAttachment[]) => {
      const currentSessionId = activeSessionIdRef.current;
      if (streaming || !currentSessionId) return;

      const currentAttachments = attachmentsOverride ?? readyAttachments;
      const isFirstMessage = messagesRef.current.length === 0;

      // Add user message locally
      const imageBlocks: ContentBlock[] = currentAttachments.map((a) => ({
        type: "image" as const,
        assetId: a.assetId,
        url: a.url,
        mimeType: a.mimeType,
        source: a.source,
      }));
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        contentBlocks: [
          { type: "text", text },
          ...imageBlocks,
        ],
      };
      setMessages((prev) => [...prev, userMsg]);

      // Persist user message (fire-and-forget with error logging)
      saveMessage(accessTokenRef.current, currentSessionId, {
        role: "user",
        content: text,
        contentBlocks: [
          { type: "text", text },
          ...imageBlocks,
        ],
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
        // ── Performance timing ──
        const perf = { t0Send: performance.now(), tAck: 0, tFirstToken: 0, gotFirstToken: false };

        // Start run via WebSocket
        const runId = await new Promise<string>((resolve) => {
          ws.startRun(
            {
              sessionId: currentSessionId,
              conversationId: canvasId,
              prompt: text,
              canvasId,
              accessToken: accessTokenRef.current,
              ...(currentAttachments.length > 0
                ? { attachments: currentAttachments }
                : {}),
              ...(activeImageModelRef.current
                ? { imageModel: activeImageModelRef.current }
                : {}),
            },
            (ack) => {
              perf.tAck = performance.now();
              console.log(`[perf] send → ack: ${(perf.tAck - perf.t0Send).toFixed(0)}ms`);
              resolve(ack.payload.runId as string);
            },
          );
        });
        clearAttachments();

        // Listen for events via WebSocket
        let resolveStream: () => void;
        const streamDone = new Promise<void>((r) => {
          resolveStream = r;
        });

        const cleanup = ws.onEvent((event) => {
          if (event.runId !== runId) return;
          if (abortRef.current) {
            resolveStream();
            return;
          }

          // Track first token timing
          if (!perf.gotFirstToken && event.type === "message.delta") {
            perf.tFirstToken = performance.now();
            perf.gotFirstToken = true;
            console.log(
              `[perf] send → first token: ${(perf.tFirstToken - perf.t0Send).toFixed(0)}ms` +
              ` (ack→token: ${(perf.tFirstToken - perf.tAck).toFixed(0)}ms)`,
            );
          }

          handleStreamEvent(event, assistantId);

          // Fire canvas insertion callback for image artifacts.
          // Skip screenshot_canvas — those are for the agent to see, not for canvas insertion.
          if (
            event.type === "tool.completed" &&
            event.artifacts &&
            event.toolName !== "screenshot_canvas" &&
            onImageGenerated
          ) {
            for (const artifact of event.artifacts) {
              if (artifact.type === "image") {
                onImageGenerated(artifact as ImageArtifact);
              }
            }
          }

          if (event.type === "canvas.sync" && onCanvasSync) {
            onCanvasSync();
          }

          if (
            event.type === "run.completed" ||
            event.type === "run.failed" ||
            event.type === "run.canceled"
          ) {
            resolveStream();
          }
        });

        await streamDone;
        cleanup();

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
          }).catch((err) =>
            console.error("[chat] Failed to save assistant message:", err),
          );
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
    [streaming, canvasId, handleStreamEvent, onImageGenerated, onCanvasSync, readyAttachments, clearAttachments, ws],
  );

  // Auto-send initial prompt from Home page (once, after sessions load).
  // Reads any attachments stored in sessionStorage by useCreateProject and
  // clears them immediately so they are consumed exactly once.
  useEffect(() => {
    if (!initialPrompt || sessionsLoading || initialPromptSent.current) return;
    initialPromptSent.current = true;

    let storedAttachments: ReadyAttachment[] | undefined;
    try {
      const raw = sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY);
      if (raw) {
        storedAttachments = JSON.parse(raw) as ReadyAttachment[];
        sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
      }
    } catch {
      // Malformed JSON or unavailable storage — proceed without attachments
    }

    void handleSend(initialPrompt, storedAttachments);
  }, [initialPrompt, sessionsLoading, handleSend]);

  if (!open) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <button
          onClick={onToggle}
          type="button"
          className="group inline-flex items-center gap-1 rounded-xl bg-white/80 backdrop-blur-sm border border-black/[0.06] px-2.5 py-1.5 text-xs text-[#2F3640]/60 shadow-sm hover:bg-white hover:text-[#2F3640] transition-colors cursor-pointer"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none">
            <path
              fill="currentColor"
              fillOpacity={0.9}
              d="M18.25 3c2.071 0 3.946 2.16 3.946 4.23L22 15.75a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM7.5 10q-.053 0-.104.005a1.25 1.25 0 0 0-1.14 1.117l-.006.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 7.5 10m4.5 0q-.053 0-.104.005a1.25 1.25 0 0 0-1.14 1.117l-.006.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 12 10m4.5 0q-.053 0-.105.005a1.25 1.25 0 0 0-1.138 1.117l-.007.128.007.128a1.25 1.25 0 1 0 1.37-1.371l-.02-.002A1 1 0 0 0 16.5 10"
            />
          </svg>
          对话
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full shrink-0"
      style={{ width: sidebarWidth }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
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
            title="Collapse panel"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
              <path d="M4 3.25a.75.75 0 0 1 .75.75v16a.75.75 0 0 1-1.5 0V4A.75.75 0 0 1 4 3.25m9.47 2.22a.75.75 0 0 1 1.06 0l6 6a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 1 1-1.06-1.06l4.72-4.72H8a.75.75 0 0 1 0-1.5h10.19l-4.72-4.72a.75.75 0 0 1 0-1.06" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Disconnected banner */}
        {!ws.connected && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F5] border-b border-black/[0.04]">
            <div className="h-1.5 w-1.5 rounded-full bg-[#A4A9B2] animate-pulse" />
            <span className="text-[11px] text-[#A4A9B2]">连接已断开，正在重连...</span>
          </div>
        )}

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
        <div className="relative">
          {atQuery !== null && onRequestCanvasImages && (
            <CanvasImagePicker
              items={onRequestCanvasImages()}
              query={atQuery}
              onSelect={(item) => {
                addCanvasRef({
                  assetId: item.assetId,
                  url: item.url,
                  mimeType: item.mimeType,
                  name: item.name,
                });
                chatInputRef.current?.clearAtQuery();
                setAtQuery(null);
              }}
              onClose={() => setAtQuery(null)}
            />
          )}
          <ChatInput
            ref={chatInputRef}
            onSend={handleSend}
            disabled={streaming || sessionsLoading}
            attachments={imageAttachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            onRetryAttachment={retryUpload}
            isUploading={isUploading}
            onAtQuery={onRequestCanvasImages ? setAtQuery : undefined}
          />
        </div>
      </div>
    </div>
  );
}
