"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatSessionSummary, ContentBlock } from "@loomic/shared";
import type { ChatMessage as ChatMessageData } from "@loomic/shared";
import {
  createSession,
  deleteSession as deleteSessionApi,
  fetchMessages,
  fetchSessions,
  updateSessionTitle,
} from "../lib/server-api";

// ── Types ────────────────────────────────────────────────────

export type Message = {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
};

// ── LRU message cache ────────────────────────────────────────
// Limits memory usage by evicting the least-recently-accessed
// session's messages when the cache exceeds MAX_CACHED_SESSIONS.

const MAX_CACHED_SESSIONS = 10;

type LRUMessageCache = {
  get(sessionId: string): Message[] | undefined;
  set(sessionId: string, messages: Message[]): void;
  delete(sessionId: string): void;
};

function createLRUMessageCache(): LRUMessageCache {
  // Map preserves insertion order; we move accessed keys to the end.
  const cache = new Map<string, Message[]>();

  return {
    get(sessionId) {
      const value = cache.get(sessionId);
      if (value !== undefined) {
        // Move to end (most recently used)
        cache.delete(sessionId);
        cache.set(sessionId, value);
      }
      return value;
    },

    set(sessionId, messages) {
      // Delete first so re-insert moves to end
      cache.delete(sessionId);
      cache.set(sessionId, messages);

      // Evict oldest if over capacity
      if (cache.size > MAX_CACHED_SESSIONS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
    },

    delete(sessionId) {
      cache.delete(sessionId);
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────

export function mapServerMessages(
  serverMessages: ChatMessageData[],
): Message[] {
  return serverMessages.map((m) => {
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
    return { id: m.id, role: m.role, contentBlocks: blocks };
  });
}

// ── Hook ─────────────────────────────────────────────────────

type UseChatSessionsOptions = {
  canvasId: string;
  accessToken: string;
  initialSessionId?: string | undefined;
  onSessionChange?: ((sessionId: string) => void) | undefined;
};

export function useChatSessions({
  canvasId,
  accessToken,
  initialSessionId,
  onSessionChange,
}: UseChatSessionsOptions) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Refs to avoid stale closures in callbacks
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  // LRU message cache (replaces unbounded Record)
  const msgCacheRef = useRef<LRUMessageCache>(createLRUMessageCache());

  // ── Update messages for a specific session ──
  // Always writes to cache; only syncs to React state if the session is visible.
  const updateSessionMessages = useCallback(
    (targetSessionId: string, updater: (prev: Message[]) => Message[]) => {
      const prev = msgCacheRef.current.get(targetSessionId) ?? [];
      const next = updater(prev);
      msgCacheRef.current.set(targetSessionId, next);
      if (activeSessionIdRef.current === targetSessionId) {
        setMessages(next);
      }
    },
    [],
  );

  // ── Load sessions on mount ──
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
          const target = initialSessionId
            ? (res.sessions.find((s: ChatSessionSummary) => s.id === initialSessionId) ??
              res.sessions[0]!)
            : res.sessions[0]!;
          setActiveSessionId(target.id);
          onSessionChangeRef.current?.(target.id);
          const msgRes = await fetchMessages(token, target.id);
          if (cancelled) return;
          const mapped = mapServerMessages(msgRes.messages);
          msgCacheRef.current.set(target.id, mapped);
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
    // Intentionally depends only on canvasId — accessTokenRef, onSessionChangeRef,
    // initialSessionId, and msgCacheRef are stable refs that never trigger re-runs.
    // This effect is a one-time init per canvas, not a token-refresh handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasId]);

  // ── Session switch ──
  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) return;
      if (streaming) setStreaming(false);
      setActiveSessionId(sessionId);
      onSessionChangeRef.current?.(sessionId);

      const cached = msgCacheRef.current.get(sessionId);
      if (cached && cached.length > 0) {
        setMessages(cached);
      } else {
        setMessages([]);
        setMessagesLoading(true);
        try {
          const msgRes = await fetchMessages(accessTokenRef.current, sessionId);
          const mapped = mapServerMessages(msgRes.messages);
          msgCacheRef.current.set(sessionId, mapped);
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

  // ── New chat ──
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

  // ── Delete session ──
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (streaming || !sessionId) return;
      const token = accessTokenRef.current;
      const remaining = sessionsRef.current.filter((s) => s.id !== sessionId);

      if (remaining.length === 0) {
        try {
          const res = await createSession(token, canvasId);
          setSessions([res.session]);
          setActiveSessionId(res.session.id);
          onSessionChangeRef.current?.(res.session.id);
          setMessages([]);
        } catch {
          return;
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
              msgCacheRef.current.set(next.id, mapped);
              setMessages(mapped);
            })
            .catch(() => setMessages([]))
            .finally(() => setMessagesLoading(false));
        }
      }

      // Delete in background
      deleteSessionApi(token, sessionId).catch(() => {
        fetchSessions(token, canvasId)
          .then((res) => setSessions(res.sessions))
          .catch(() => {});
      });

      // Clean up cached messages for deleted session
      msgCacheRef.current.delete(sessionId);
    },
    [canvasId, streaming],
  );

  // ── Auto-title first message ──
  const autoTitleSession = useCallback((text: string) => {
    const currentSessionId = activeSessionIdRef.current;
    if (!currentSessionId) return;
    const isFirstMessage = messagesRef.current.length === 0;
    if (!isFirstMessage) return;

    const title = text.length > 50 ? `${text.slice(0, 47)}...` : text;
    void updateSessionTitle(accessTokenRef.current, currentSessionId, title);
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSessionId ? { ...s, title } : s)),
    );
  }, []);

  // ── Reload messages (for reconnection) ──
  const reloadMessages = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      console.warn("[chat] reloadMessages called with empty sessionId, skipping");
      return;
    }
    try {
      const msgRes = await fetchMessages(accessTokenRef.current, sessionId);
      if (msgRes.messages && msgRes.messages.length > 0) {
        const mapped = mapServerMessages(msgRes.messages);
        msgCacheRef.current.set(sessionId, mapped);
        // Only update React state if the session is still active
        // (user may have switched sessions during the async fetch)
        if (activeSessionIdRef.current === sessionId) {
          setMessages(mapped);
        }
      }
    } catch (err) {
      console.warn("[chat] Failed to reload messages on reconnect:", err);
    }
  }, []);

  return {
    sessions,
    activeSessionId,
    activeSessionIdRef,
    messages,
    messagesRef,
    setMessages,
    sessionsLoading,
    messagesLoading,
    streaming,
    setStreaming,
    updateSessionMessages,
    handleSelectSession,
    handleNewChat,
    handleDeleteSession,
    autoTitleSession,
    reloadMessages,
    accessTokenRef,
  };
}
