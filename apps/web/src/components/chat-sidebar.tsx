"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatMessage as ChatMessageData,
  ChatSessionSummary,
  ContentBlock,
  ImageArtifact,
  ImageGenerationPreference,
  MessageMention,
  StreamEvent,
  TextBlock,
  ToolBlock,
  VideoGenerationPreference,
} from "@loomic/shared";
import type { ReadyAttachment } from "../hooks/use-image-attachments";
import type { WebSocketHandle } from "../hooks/use-websocket";
import {
  createSession,
  deleteSession as deleteSessionApi,
  fetchMessages,
  fetchImageModels,
  fetchSessions,
  saveMessage,
  updateSessionTitle,
} from "../lib/server-api";
import { fetchBrandKit } from "../lib/brand-kit-api";
import { useAgentModel } from "../hooks/use-agent-model";
import { useImageAttachments } from "../hooks/use-image-attachments";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import {
  INITIAL_AGENT_MODEL_KEY,
  INITIAL_ATTACHMENTS_KEY,
  INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
} from "../hooks/use-create-project";
import type { CanvasSelectedElement } from "./canvas-editor";
import {
  MessageMentionPicker,
  type BrandKitMentionItem,
  type CanvasImageItem,
  type ImageModelMentionItem,
  type MessageMentionPickerItem,
} from "./canvas-image-picker";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { ChatSkills } from "./chat-skills";
import { SessionSelector } from "./session-selector";
import { CreditInsufficientDialog } from "./credits/credit-insufficient-dialog";
import { claimDailyCredits } from "../lib/credits-api";

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
  currentBrandKitId?: string | null;
  ws: WebSocketHandle;
  selectedCanvasElements?: CanvasSelectedElement[];
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
  currentBrandKitId,
  ws,
  selectedCanvasElements,
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [messageMentions, setMessageMentions] = useState<MessageMention[]>([]);
  const [brandKitMentionItems, setBrandKitMentionItems] = useState<
    BrandKitMentionItem[]
  >([]);
  const [imageModelMentionItems, setImageModelMentionItems] = useState<
    ImageModelMentionItem[]
  >([]);
  const [creditDialog, setCreditDialog] = useState<{
    open: boolean;
    currentBalance: number;
    requiredAmount: number;
    plan: string;
    dailyClaimed: boolean;
  } | null>(null);
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

  // Per-session message cache: keeps messages alive across session switches
  // so streaming results accumulate in background even when the user views
  // another session. Cache is keyed by sessionId.
  const sessionsMsgCacheRef = useRef<Record<string, Message[]>>({});

  // Update messages for a specific session. Always writes to the cache;
  // only syncs to React state if the target session is currently visible.
  const updateSessionMessages = useCallback(
    (targetSessionId: string, updater: (prev: Message[]) => Message[]) => {
      const prev = sessionsMsgCacheRef.current[targetSessionId] ?? [];
      const next = updater(prev);
      sessionsMsgCacheRef.current[targetSessionId] = next;
      if (activeSessionIdRef.current === targetSessionId) {
        setMessages(next);
      }
    },
    [],
  );
  const messageMentionsRef = useRef(messageMentions);
  messageMentionsRef.current = messageMentions;
  const selectedCanvasElementsRef = useRef(selectedCanvasElements);
  selectedCanvasElementsRef.current = selectedCanvasElements;
  const prevConnectedRef = useRef(false);

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

  const { activeImageGenerationPreference } = useImageModelPreference();
  const activeImageGenerationPreferenceRef = useRef(
    activeImageGenerationPreference,
  );
  activeImageGenerationPreferenceRef.current = activeImageGenerationPreference;

  const { activeVideoGenerationPreference } = useVideoModelPreference();
  const activeVideoGenerationPreferenceRef = useRef(
    activeVideoGenerationPreference,
  );
  activeVideoGenerationPreferenceRef.current = activeVideoGenerationPreference;

  const { model: agentModel } = useAgentModel();
  const agentModelRef = useRef(agentModel);
  agentModelRef.current = agentModel;

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

  useEffect(() => {
    let cancelled = false;

    fetchImageModels()
      .then((data) => {
        if (cancelled) return;
        setImageModelMentionItems(
          data.models.map((model) => ({
            kind: "image-model",
            id: model.id,
            label: model.displayName,
            description: model.description,
            ...(model.iconUrl ? { iconUrl: model.iconUrl } : {}),
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setImageModelMentionItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentBrandKitId) {
      setBrandKitMentionItems([]);
      return;
    }

    let cancelled = false;
    fetchBrandKit(accessTokenRef.current, currentBrandKitId)
      .then((kit) => {
        if (cancelled) return;
        setBrandKitMentionItems(
          kit.assets.map((asset) => ({
            kind: "brand-kit-asset",
            id: asset.id,
            label: asset.display_name,
            assetType: asset.asset_type,
            textContent: asset.text_content,
            fileUrl: asset.file_url,
            thumbnailUrl:
              asset.asset_type === "logo" || asset.asset_type === "image"
                ? asset.file_url
                : null,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setBrandKitMentionItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentBrandKitId]);

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
          const mapped = mapServerMessages(msgRes.messages);
          sessionsMsgCacheRef.current[target.id] = mapped;
          setMessages(mapped);
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
      if (sessionId === activeSessionIdRef.current) return;
      // Allow switching even while streaming — the run continues server-side
      // and results accumulate in sessionsMsgCacheRef. When the user switches
      // back, the cache is restored instantly.
      if (streaming) setStreaming(false);
      setActiveSessionId(sessionId);
      onSessionChangeRef.current?.(sessionId);

      // Restore from cache if available (instant), otherwise fetch from DB
      const cached = sessionsMsgCacheRef.current[sessionId];
      if (cached && cached.length > 0) {
        setMessages(cached);
      } else {
        setMessages([]);
        setMessagesLoading(true);
        try {
          const msgRes = await fetchMessages(
            accessTokenRef.current,
            sessionId,
          );
          const mapped = mapServerMessages(msgRes.messages);
          sessionsMsgCacheRef.current[sessionId] = mapped;
          setMessages(mapped);
        } catch (err) {
          console.error("[chat] Failed to load session messages:", err);
        } finally {
          setMessagesLoading(false);
        }
      }
    },
    [streaming],
  );

  const handleNewChat = useCallback(async () => {
    if (streaming) setStreaming(false);
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
          setMessagesLoading(true);
          fetchMessages(token, next.id)
            .then((msgRes) => {
              const mapped = mapServerMessages(msgRes.messages);
              sessionsMsgCacheRef.current[next.id] = mapped;
              setMessages(mapped);
            })
            .catch(() => setMessages([]))
            .finally(() => setMessagesLoading(false));
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
    [updateSessionMessages],
  );

  const handleSend = useCallback(
    async (
      text: string,
      attachmentsOverride?: ReadyAttachment[],
      imageGenerationPreferenceOverride?: ImageGenerationPreference,
      mentionsOverride?: MessageMention[],
    ) => {
      const currentSessionId = activeSessionIdRef.current;
      if (streaming || !currentSessionId) return;

      // Merge explicitly-attached images with auto-sensed canvas selection images
      let currentAttachments = attachmentsOverride ?? readyAttachments;
      const selectedEls = selectedCanvasElementsRef.current ?? [];
      const selectedImageEls = selectedEls.filter(
        (el) => el.type === "image" && el.fileId && (el.storageUrl || el.dataUrl),
      );
      if (selectedImageEls.length > 0 && !attachmentsOverride) {
        // Deduplicate: skip selected images already in explicit attachments (by assetId/element id)
        const existingIds = new Set(currentAttachments.map((a) => a.assetId));
        const selectionAttachments: ReadyAttachment[] = selectedImageEls
          .filter((el) => !existingIds.has(el.id))
          .map((el) => ({
            assetId: el.id,
            url: el.storageUrl ?? el.dataUrl!,
            mimeType: "image/png",
            source: "canvas-ref" as const,
            name: `Canvas selection ${el.id.slice(0, 6)}`,
          }));
        if (selectionAttachments.length > 0) {
          currentAttachments = [...currentAttachments, ...selectionAttachments];
        }
      }
      const currentImageGenerationPreference =
        imageGenerationPreferenceOverride ??
        activeImageGenerationPreferenceRef.current;
      const currentVideoGenerationPreference =
        activeVideoGenerationPreferenceRef.current;
      const currentMentions = mentionsOverride ?? messageMentionsRef.current;
      const isFirstMessage = messagesRef.current.length === 0;

      // Add user message locally
      const imageBlocks: ContentBlock[] = currentAttachments.map((a) => ({
        type: "image" as const,
        assetId: a.assetId,
        url: a.url,
        mimeType: a.mimeType,
        source: a.source,
        ...(a.name ? { name: a.name } : {}),
      }));
      const mentionBlocks: ContentBlock[] = currentMentions.map((mention) =>
        mention.mentionType === "image-model"
          ? {
              type: "mention" as const,
              mentionType: "image-model" as const,
              id: mention.id,
              label: mention.label,
            }
          : {
              type: "mention" as const,
              mentionType: "brand-kit-asset" as const,
              id: mention.id,
              label: mention.label,
              assetType: mention.assetType,
              ...(mention.textContent !== undefined
                ? { textContent: mention.textContent }
                : {}),
              ...(mention.fileUrl !== undefined
                ? { fileUrl: mention.fileUrl }
                : {}),
            },
      );
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        contentBlocks: [
          { type: "text", text },
          ...mentionBlocks,
          ...imageBlocks,
        ],
      };
      updateSessionMessages(currentSessionId, (prev) => [...prev, userMsg]);

      // Persist user message (fire-and-forget with error logging)
      saveMessage(accessTokenRef.current, currentSessionId, {
        role: "user",
        content: text,
        contentBlocks: [
          { type: "text", text },
          ...mentionBlocks,
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
      updateSessionMessages(currentSessionId, (prev) => [
        ...prev,
        { id: assistantId, role: "assistant", contentBlocks: [] },
      ]);
      setStreaming(true);
      abortRef.current = false;

      try {
        // ── Performance timing ──
        const perf = { t0Send: performance.now(), tAck: 0, tFirstToken: 0, gotFirstToken: false };

        // Register event listener BEFORE starting the run so no events
        // can arrive in the gap between ACK and listener registration.
        let resolveStream: () => void;
        const streamDone = new Promise<void>((r) => {
          resolveStream = r;
        });
        const runIdRef = { current: "" };

        const cleanup = ws.onEvent((event) => {
          // Ignore events from other runs; also skip until we know our runId
          if (!runIdRef.current || event.runId !== runIdRef.current) return;
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

          // Credits insufficient: show dialog, let run.canceled resolve stream
          if (event.type === "credits.insufficient") {
            setCreditDialog({
              open: true,
              currentBalance: event.currentBalance,
              requiredAmount: event.requiredAmount,
              plan: event.plan,
              dailyClaimed: event.dailyClaimed,
            });
          }

          handleStreamEvent(event, assistantId, currentSessionId);

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

        // Start run via WebSocket (with timeout to prevent hanging forever)
        const runId = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("WebSocket ack timeout — connection may be down"));
          }, 10_000);

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
              ...(currentMentions.length > 0 ? { mentions: currentMentions } : {}),
              ...(currentImageGenerationPreference
                ? {
                    imageGenerationPreference:
                      currentImageGenerationPreference,
                  }
                : {}),
              ...(currentVideoGenerationPreference
                ? {
                    videoGenerationPreference:
                      currentVideoGenerationPreference,
                  }
                : {}),
              ...(agentModelRef.current ? { model: agentModelRef.current } : {}),
            },
            (ack) => {
              clearTimeout(timeout);
              perf.tAck = performance.now();
              console.log(`[perf] send → ack: ${(perf.tAck - perf.t0Send).toFixed(0)}ms`);
              const id = ack.payload.runId as string;
              runIdRef.current = id;
              resolve(id);
            },
          );
        });
        clearAttachments();
        setMessageMentions([]);

        await streamDone;
        cleanup();

        // Assistant message is persisted server-side in handler.ts after the run completes.
        // No client-side save needed — dual save caused duplicate messages in DB.
      } catch {
        updateSessionMessages(currentSessionId, (prev) =>
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
    [streaming, canvasId, handleStreamEvent, updateSessionMessages, onImageGenerated, onCanvasSync, readyAttachments, clearAttachments, ws],
  );

  const mentionPickerItems: MessageMentionPickerItem[] = [
    ...(onRequestCanvasImages ? onRequestCanvasImages() : []),
    ...brandKitMentionItems,
    ...imageModelMentionItems,
  ];

  const handleMentionSelect = useCallback((item: MessageMentionPickerItem) => {
    if (item.kind === "canvas-image") {
      addCanvasRef({
        assetId: item.assetId,
        url: item.url,
        mimeType: item.mimeType,
        name: item.name,
      });
      return;
    }

    setMessageMentions((prev) => {
      const nextMention: MessageMention =
        item.kind === "image-model"
          ? {
              mentionType: "image-model",
              id: item.id,
              label: item.label,
            }
          : {
              mentionType: "brand-kit-asset",
              id: item.id,
              label: item.label,
              assetType: item.assetType,
              ...(item.textContent !== undefined
                ? { textContent: item.textContent }
                : {}),
              ...(item.fileUrl !== undefined ? { fileUrl: item.fileUrl } : {}),
            };

      if (
        prev.some(
          (mention) =>
            mention.mentionType === nextMention.mentionType &&
            mention.id === nextMention.id,
        )
      ) {
        return prev;
      }
      return [...prev, nextMention];
    });
  }, [addCanvasRef]);

  const handleRemoveMention = useCallback((mention: MessageMention) => {
    setMessageMentions((prev) =>
      prev.filter(
        (item) =>
          !(
            item.mentionType === mention.mentionType &&
            item.id === mention.id
          ),
      ),
    );
  }, []);

  // Auto-send initial prompt from Home page (once, after sessions load AND WS connects).
  // Reads any attachments stored in sessionStorage by useCreateProject and
  // clears them immediately so they are consumed exactly once.
  // Uses setTimeout(0) so StrictMode cleanup can cancel the send before it
  // fires on the first (doomed) mount — the real send happens on the second mount.
  useEffect(() => {
    if (!initialPrompt || sessionsLoading || !ws.connected || initialPromptSent.current) return;

    let storedAttachments: ReadyAttachment[] | undefined;
    let storedImageGenerationPreference: ImageGenerationPreference | undefined;
    let storedAgentModel: string | undefined;
    try {
      const raw = sessionStorage.getItem(INITIAL_ATTACHMENTS_KEY);
      if (raw) {
        storedAttachments = JSON.parse(raw) as ReadyAttachment[];
        sessionStorage.removeItem(INITIAL_ATTACHMENTS_KEY);
      }

      const preferenceRaw = sessionStorage.getItem(
        INITIAL_IMAGE_GENERATION_PREFERENCE_KEY,
      );
      if (preferenceRaw) {
        storedImageGenerationPreference = JSON.parse(
          preferenceRaw,
        ) as ImageGenerationPreference;
        sessionStorage.removeItem(INITIAL_IMAGE_GENERATION_PREFERENCE_KEY);
      }

      const modelRaw = sessionStorage.getItem(INITIAL_AGENT_MODEL_KEY);
      if (modelRaw) {
        storedAgentModel = modelRaw;
        sessionStorage.removeItem(INITIAL_AGENT_MODEL_KEY);
      }
    } catch {
      // Malformed JSON or unavailable storage — proceed without attachments
    }

    // Temporarily set the agent model ref so the startRun picks it up
    if (storedAgentModel) {
      agentModelRef.current = storedAgentModel;
    }

    const timer = setTimeout(() => {
      // Double-check the session is ready before marking as sent.
      // If activeSessionId is still null, leave the flag false so the
      // effect retries on the next dependency change.
      if (!activeSessionIdRef.current) return;
      initialPromptSent.current = true;
      void handleSend(
        initialPrompt,
        storedAttachments,
        storedImageGenerationPreference,
      );
    }, 0);

    return () => clearTimeout(timer);
  }, [initialPrompt, sessionsLoading, ws.connected, handleSend]);

  // ── Reconnection: resume canvas binding + reload messages ──
  // Depends on sessionsLoading so it re-evaluates after sessions finish loading
  // (on page refresh, WS connects before sessions load — without this dep the
  // effect would skip because activeSessionIdRef is still null).
  useEffect(() => {
    if (!ws.connected || sessionsLoading) {
      if (!ws.connected) prevConnectedRef.current = false;
      return;
    }
    if (prevConnectedRef.current) return; // already connected, skip
    prevConnectedRef.current = true;

    // Skip if no session loaded yet
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    // When arriving from Home with an initialPrompt, the initialPrompt effect
    // will call handleSend → ws.startRun which binds the canvas and registers
    // its own event listener. Running resumeCanvas here at the same time would
    // register a SECOND listener for the same run → duplicate assistant messages.
    if (initialPrompt && !initialPromptSent.current) return;

    // Reload messages from DB first (server may have persisted while we were disconnected),
    // then resume canvas binding. Sequential order avoids fetchMessages overwriting the
    // placeholder message that canvas.resume creates for active runs.
    void (async () => {
      try {
        const msgRes = await fetchMessages(accessTokenRef.current, sessionId);
        if (msgRes.messages.length > 0) {
          const mapped = mapServerMessages(msgRes.messages);
          sessionsMsgCacheRef.current[sessionId] = mapped;
          setMessages(mapped);
        }
      } catch (err) {
        console.warn("[chat] Failed to reload messages on reconnect:", err);
      }

      // Now resume canvas binding (after DB messages are set)
      ws.resumeCanvas(canvasId, (ack) => {
        const activeRunId = (ack.payload as Record<string, unknown>).activeRunId;
        if (activeRunId && typeof activeRunId === "string") {
          setStreaming(true);

          // Register temporary listener to handle run terminal events and
          // apply live deltas to a placeholder assistant message.
          const assistantId = `resumed_${activeRunId}`;
          setMessages((prev) => {
            // Only add placeholder if not already present (avoid duplicates on rapid reconnects)
            if (prev.some((m) => m.id === assistantId)) return prev;
            return [...prev, { id: assistantId, role: "assistant" as const, contentBlocks: [] }];
          });

          const unsub = ws.onEvent((evt) => {
            if (evt.runId !== activeRunId) return;

            // Apply live events to the placeholder message
            if (evt.type === "message.delta") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const blocks = [...m.contentBlocks];
                  const last = blocks[blocks.length - 1];
                  if (last && last.type === "text") {
                    blocks[blocks.length - 1] = { ...last, text: last.text + evt.delta };
                  } else {
                    blocks.push({ type: "text", text: evt.delta });
                  }
                  return { ...m, contentBlocks: blocks };
                }),
              );
            } else if (evt.type === "tool.started") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  return {
                    ...m,
                    contentBlocks: [
                      ...m.contentBlocks,
                      { type: "tool" as const, toolCallId: evt.toolCallId, toolName: evt.toolName, status: "running" as const, ...(evt.input ? { input: evt.input } : {}) },
                    ],
                  };
                }),
              );
            } else if (evt.type === "tool.completed") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  return {
                    ...m,
                    contentBlocks: m.contentBlocks.map((block) => {
                      if (block.type === "tool" && block.toolCallId === evt.toolCallId) {
                        return { ...block, status: "completed" as const, ...(evt.output ? { output: evt.output } : {}), ...(evt.outputSummary ? { outputSummary: evt.outputSummary } : {}), ...(evt.artifacts ? { artifacts: evt.artifacts } : {}) };
                      }
                      return block;
                    }),
                  };
                }),
              );
            }

            // Terminal events: stop streaming + cleanup
            if (evt.type === "run.completed" || evt.type === "run.failed" || evt.type === "run.canceled") {
              setStreaming(false);
              unsub();
            }
          });
        }
    });
    })();
  }, [ws.connected, ws, canvasId, sessionsLoading]);

  if (!open) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <button
          onClick={onToggle}
          type="button"
          className="group inline-flex items-center gap-1 rounded-xl bg-card/80 backdrop-blur-sm border border-border px-2.5 py-1.5 text-xs text-foreground/60 shadow-sm hover:bg-card hover:text-foreground transition-colors cursor-pointer"
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
      onCopy={(e) => e.stopPropagation()}
      onCut={(e) => e.stopPropagation()}
      onPaste={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Resize handle */}
      <div
        className="w-2 shrink-0 cursor-col-resize bg-gradient-to-r from-transparent via-border to-transparent shadow-[1px_0_10px_rgba(15,23,42,0.06)] transition-all hover:via-muted-foreground/40 hover:shadow-[1px_0_14px_rgba(15,23,42,0.1)] active:via-muted-foreground/60 active:shadow-[1px_0_16px_rgba(15,23,42,0.14)]"
        onMouseDown={handleMouseDown}
      />
      <div className="flex flex-1 flex-col bg-card min-w-0">
        {/* Header */}
        <div className="flex min-h-[48px] items-center justify-between pl-4 pr-2">
          <div className="flex items-center gap-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground shrink-0">Loomic Agent</h2>
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
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
            title="Collapse panel"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
              <path d="M4 3.25a.75.75 0 0 1 .75.75v16a.75.75 0 0 1-1.5 0V4A.75.75 0 0 1 4 3.25m9.47 2.22a.75.75 0 0 1 1.06 0l6 6a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 1 1-1.06-1.06l4.72-4.72H8a.75.75 0 0 1 0-1.5h10.19l-4.72-4.72a.75.75 0 0 1 0-1.06" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Disconnected banner */}
        {!ws.connected && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b border-border">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-[pulse_1.2s_ease-in-out_infinite]" />
            <span className="text-[11px] text-muted-foreground">连接已断开，正在重连...</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-6 px-4 py-4">
          {sessionsLoading || messagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
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
          {atQuery !== null && mentionPickerItems.length > 0 && (
            <MessageMentionPicker
              items={mentionPickerItems}
              query={atQuery}
              onSelect={(item) => {
                handleMentionSelect(item);
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
            onAtQuery={setAtQuery}
            mentions={messageMentions}
            onRemoveMention={handleRemoveMention}
            selectedCanvasElements={selectedCanvasElements}
          />
        </div>
      </div>
      {creditDialog && (
        <CreditInsufficientDialog
          open={creditDialog.open}
          onClose={() => setCreditDialog(null)}
          currentBalance={creditDialog.currentBalance}
          requiredAmount={creditDialog.requiredAmount}
          plan={creditDialog.plan}
          dailyClaimed={creditDialog.dailyClaimed}
          onClaimDaily={async () => {
            await claimDailyCredits(accessTokenRef.current);
          }}
        />
      )}
    </div>
  );
}
