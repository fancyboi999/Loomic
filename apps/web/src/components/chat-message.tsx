"use client";

import { useState } from "react";

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
          <ToolBlockView key={block.toolCallId} block={block} />
        );
      })}
    </div>
  );
}

function ToolBlockView({ block }: { block: ToolBlock }) {
  const [expanded, setExpanded] = useState(false);
  const hasInput = block.input && Object.keys(block.input).length > 0;

  return (
    <div className="space-y-1.5">
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
        {hasInput && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-black/[0.04] transition-colors cursor-pointer"
            title={expanded ? "收起参数" : "展开参数"}
          >
            <svg
              className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Expanded tool input parameters */}
      {expanded && hasInput && (
        <div className="ml-[18px] rounded-md bg-[#F8F8F8] border border-black/[0.04] px-2.5 py-2 text-[11px] text-[#5A6270] space-y-1">
          {Object.entries(block.input!).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="shrink-0 font-medium text-[#8B929D]">
                {formatParamName(key)}
              </span>
              <span className="break-all text-[#2F3640]">
                {formatParamValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}

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
}

function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatParamName(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toLowerCase();
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 197)}...` : value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : JSON.stringify(value);
  return JSON.stringify(value);
}
