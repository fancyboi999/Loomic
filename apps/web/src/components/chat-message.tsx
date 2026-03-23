"use client";

type ToolActivity = {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed";
  outputSummary?: string | undefined;
};

type ChatMessageProps = {
  role: "user" | "assistant";
  content: string;
  toolActivities?: ToolActivity[] | undefined;
  isStreaming?: boolean | undefined;
};

export type { ToolActivity };

export function ChatMessage({ role, content, toolActivities, isStreaming }: ChatMessageProps) {
  return (
    <div className={`flex gap-3 ${role === "user" ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium ${
        role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}>
        {role === "user" ? "U" : "AI"}
      </div>

      {/* Content */}
      <div className={`min-w-0 max-w-[85%] space-y-2 ${role === "user" ? "text-right" : ""}`}>
        <div className={`inline-block rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}>
          {content}
          {isStreaming && <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse" />}
        </div>

        {/* Tool activities */}
        {toolActivities && toolActivities.length > 0 && (
          <div className="space-y-1">
            {toolActivities.map((tool) => (
              <div
                key={tool.toolCallId}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {tool.status === "running" ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                ) : (
                  <svg className="h-3 w-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                  </svg>
                )}
                <span>{formatToolName(tool.toolName)}</span>
                {tool.outputSummary && (
                  <span className="truncate opacity-70">— {tool.outputSummary}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
