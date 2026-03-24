"use client";

import type { ContentBlock, ToolArtifact, ToolBlock } from "@loomic/shared";

export type { ContentBlock, ToolArtifact };

/** @deprecated Use ToolBlock from @loomic/shared instead */
export type ToolActivity = ToolBlock; // backward compat

type ChatMessageProps = {
  role: "user" | "assistant";
  contentBlocks: ContentBlock[];
  isStreaming?: boolean;
};

export function ChatMessage({
  role,
  contentBlocks,
  isStreaming,
}: ChatMessageProps) {
  const isUser = role === "user";

  if (isUser) {
    const text = contentBlocks[0]?.type === "text" ? contentBlocks[0].text : "";
    return (
      <div className="flex w-full justify-end pl-10">
        <div className="whitespace-pre-wrap text-sm leading-[1.6] text-[#2F3640]">
          {text}
        </div>
      </div>
    );
  }

  // Find the last text block index for streaming cursor placement
  let lastTextIdx = -1;
  for (let i = contentBlocks.length - 1; i >= 0; i--) {
    if (contentBlocks[i]!.type === "text") {
      lastTextIdx = i;
      break;
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 pr-10">
      {contentBlocks.map((block, idx) => {
        if (block.type === "text") {
          return (
            <div
              key={idx}
              className="whitespace-pre-wrap text-sm leading-[1.6] text-[#2F3640]"
            >
              {block.text}
              {isStreaming && idx === lastTextIdx && (
                <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-[2px] bg-[#2F3640] animate-pulse rounded-full" />
              )}
            </div>
          );
        }

        // ToolBlock
        return (
          <div key={block.toolCallId} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#A4A9B2]">
              {block.status === "running" ? (
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
                {formatToolName(block.toolName)}
              </span>
              {block.outputSummary && (
                <span className="truncate opacity-60">
                  — {block.outputSummary}
                </span>
              )}
            </div>
            {block.artifacts?.map((artifact) =>
              artifact.type === "image" ? (
                <div key={artifact.url} className="space-y-1">
                  <img
                    src={artifact.url}
                    alt={artifact.title ?? "Generated image"}
                    className="max-w-[200px] rounded-md border border-[#E3E3E3]"
                    loading="lazy"
                  />
                  {artifact.title && (
                    <p className="text-[11px] text-[#A4A9B2] truncate max-w-[200px]">
                      {artifact.title}
                    </p>
                  )}
                </div>
              ) : null,
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
