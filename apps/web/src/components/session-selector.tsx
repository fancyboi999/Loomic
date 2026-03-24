"use client";

import type { ChatSessionSummary } from "@loomic/shared";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type SessionSelectorProps = {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
  onDelete: (sessionId: string) => void;
};

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function NewChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillOpacity={0.9}
        d="M18.25 3A3.75 3.75 0 0 1 22 6.75v9a3.75 3.75 0 0 1-3.75 3.75h-2.874a.25.25 0 0 0-.16.058l-2.098 1.738a1.75 1.75 0 0 1-2.24-.007l-2.065-1.73a.25.25 0 0 0-.162-.059H5.75A3.75 3.75 0 0 1 2 15.75v-9A3.75 3.75 0 0 1 5.75 3zM5.75 4.5A2.25 2.25 0 0 0 3.5 6.75v9A2.25 2.25 0 0 0 5.75 18h2.901c.412 0 .81.145 1.125.41l2.065 1.73a.25.25 0 0 0 .32 0l2.099-1.738A1.75 1.75 0 0 1 15.376 18h2.874a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25zm6.25 3a.75.75 0 0 1 .75.75v2.25H15a.75.75 0 0 1 0 1.5h-2.25v2.25a.75.75 0 0 1-1.5 0V12H9a.75.75 0 0 1 0-1.5h2.25V8.25A.75.75 0 0 1 12 7.5"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.75 2.5a.75.75 0 0 0-.75.75V4H2.5a.5.5 0 0 0 0 1h.614l.573 7.454A1.75 1.75 0 0 0 5.435 14h5.13a1.75 1.75 0 0 0 1.748-1.546L12.886 5h.614a.5.5 0 0 0 0-1H11v-.75a.75.75 0 0 0-.75-.75h-4.5ZM10 4H6v-.75a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25V4Z" />
    </svg>
  );
}

export function SessionSelector({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  onDelete,
}: SessionSelectorProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex items-center gap-1.5">
      {/* History dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer outline-none">
          <HistoryIcon className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">
            {activeSession?.title ?? "History"}
          </span>
          <svg className="h-3 w-3 opacity-50" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" sideOffset={6} className="min-w-[220px]">
          <DropdownMenuLabel>Conversations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sessions.map((s) => (
            <DropdownMenuItem
              key={s.id}
              className="group flex items-center justify-between gap-2"
              onSelect={() => onSelect(s.id)}
            >
              <span className={`truncate ${s.id === activeSessionId ? "font-medium" : ""}`}>
                {s.title}
              </span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  className="hidden group-focus:flex group-hover:flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New chat button */}
      <button
        type="button"
        onClick={onNewChat}
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="New Chat"
      >
        <NewChatIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
