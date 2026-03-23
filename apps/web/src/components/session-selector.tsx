"use client";

import type { ChatSessionSummary } from "@loomic/shared";

type SessionSelectorProps = {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onDelete: (sessionId: string) => void;
};

export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
}: SessionSelectorProps) {
  if (sessions.length === 0) {
    return (
      <button
        type="button"
        onClick={onNewChat}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        + New Chat
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeSessionId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="text-xs bg-transparent border border-border rounded px-2 py-1 max-w-[180px] truncate focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onNewChat}
        className="text-xs text-muted-foreground hover:text-foreground shrink-0"
        title="New Chat"
      >
        +
      </button>

      {activeSessionId && sessions.length > 1 && (
        <button
          type="button"
          onClick={() => onDelete(activeSessionId)}
          className="text-xs text-muted-foreground hover:text-destructive shrink-0"
          title="Delete Chat"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.75 2.5a.75.75 0 0 0-.75.75V4H2.5a.5.5 0 0 0 0 1h.614l.573 7.454A1.75 1.75 0 0 0 5.435 14h5.13a1.75 1.75 0 0 0 1.748-1.546L12.886 5h.614a.5.5 0 0 0 0-1H11v-.75a.75.75 0 0 0-.75-.75h-4.5ZM10 4H6v-.75a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25V4Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
