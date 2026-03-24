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

export function ChatMessage({
  role,
  content,
  toolActivities,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex w-full ${isUser ? "justify-end pl-10" : "flex-col gap-2 pr-10"}`}
    >
      {/* User message */}
      {isUser && (
        <div className="whitespace-pre-wrap text-sm leading-[1.6] text-[#2F3640]">
          {content}
        </div>
      )}

      {/* Assistant message */}
      {!isUser && (
        <>
          <div className="whitespace-pre-wrap text-sm leading-[1.6] text-[#2F3640]">
            {content}
            {isStreaming && (
              <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-[2px] bg-[#2F3640] animate-pulse rounded-full" />
            )}
          </div>

          {/* Tool activities */}
          {toolActivities && toolActivities.length > 0 && (
            <div className="space-y-1">
              {toolActivities.map((tool) => (
                <div
                  key={tool.toolCallId}
                  className="flex items-center gap-1.5 text-[11px] text-[#A4A9B2]"
                >
                  {tool.status === "running" ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-[#A4A9B2]/40 border-t-[#A4A9B2]" />
                  ) : (
                    <svg
                      className="h-3 w-3 text-green-500"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                    </svg>
                  )}
                  <span className="font-medium">
                    {formatToolName(tool.toolName)}
                  </span>
                  {tool.outputSummary && (
                    <span className="truncate opacity-60">
                      — {tool.outputSummary}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
