"use client";

import type { ContentBlock, ToolArtifact, ToolBlock } from "@loomic/shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
        <div className="inline-block rounded-xl bg-[#F7F7F7] px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#363636]">
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

  // Show thinking indicator when streaming but no content has arrived yet
  const hasContent = contentBlocks.some(
    (b) => (b.type === "text" && b.text.length > 0) || b.type === "tool",
  );
  const showThinking = isStreaming && !hasContent;

  return (
    <div className="flex w-full flex-col gap-2 pr-10">
      {showThinking && (
        <div className="flex items-center gap-1 text-sm text-[#A4A9B2]">
          <span>思考中</span>
          <span
            className="inline-block h-1 w-1 rounded-full bg-[#A4A9B2] animate-bounce-dot"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-[#A4A9B2] animate-bounce-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-[#A4A9B2] animate-bounce-dot"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      )}
      {contentBlocks.map((block, idx) => {
        if (block.type === "text") {
          return (
            <div
              key={idx}
              className="markdown-content text-sm leading-[1.6] text-[#2F3640]"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {block.text}
              </ReactMarkdown>
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
