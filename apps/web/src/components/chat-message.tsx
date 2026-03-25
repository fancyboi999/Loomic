"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const [modalOpen, setModalOpen] = useState(false);
  const detailBtnRef = useRef<HTMLButtonElement>(null);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    detailBtnRef.current?.focus();
  }, []);

  const isCompleted = block.status === "completed";
  const hasOutput = block.output && Object.keys(block.output).length > 0;
  const hasDetails = hasOutput || (block.input && Object.keys(block.input).length > 0);

  // Determine card title
  const cardTitle = block.outputSummary && isHumanReadable(block.outputSummary)
    ? block.outputSummary
    : formatToolName(block.toolName);

  // Preview lines from output
  const previewLines = hasOutput ? formatOutputPreview(block.output!) : [];

  return (
    <div className="space-y-1">
      {/* Layer 1: Status line */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#A4A9B2]">
        {block.status === "running" ? (
          <div className="h-3 w-3 animate-spin rounded-full border border-[#A4A9B2]/40 border-t-[#A4A9B2]" />
        ) : (
          <svg className="h-3 w-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        )}
        <span className="font-medium">{formatToolName(block.toolName)}</span>
      </div>

      {/* Layer 2: Output card (only when completed) */}
      {isCompleted && (cardTitle || previewLines.length > 0) && (
        <div className="ml-[18px] rounded-lg border border-black/[0.06] bg-[#FAFAFA] px-3 py-2">
          {/* Card title */}
          <div className="text-xs font-medium text-[#2F3640] truncate">
            {cardTitle}
          </div>

          {/* Preview lines */}
          {previewLines.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {previewLines.map((line, i) => (
                <div key={i} className="text-[11px] text-[#8B929D] truncate">
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Check Details button */}
          {hasDetails && (
            <button
              ref={detailBtnRef}
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-1.5 flex items-center gap-0.5 text-[11px] text-[#A4A9B2] hover:text-[#2F3640] transition-colors cursor-pointer"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.78 11.78a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 1.06L6.56 8l3.22 3.22a.75.75 0 0 1 0 1.06Z" />
              </svg>
              查看详情
            </button>
          )}
        </div>
      )}

      {/* Layer 3: Detail modal */}
      {hasDetails && (
        <ToolDetailModal
          block={block}
          open={modalOpen}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

function ToolDetailModal({
  block,
  open,
  onClose,
}: {
  block: ToolBlock;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const hasInput = block.input && Object.keys(block.input).length > 0;
  const [inputExpanded, setInputExpanded] = useState(false);

  // Reset input expanded state when modal closes
  useEffect(() => {
    if (!open) setInputExpanded(false);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={formatToolName(block.toolName)}
      className="m-auto max-w-lg w-full rounded-xl bg-white shadow-xl backdrop:bg-black/30 p-0"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
          <h3 className="text-sm font-semibold text-[#2F3640]">
            {formatToolName(block.toolName)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#A4A9B2] hover:bg-black/[0.04] hover:text-[#2F3640] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Input section -- collapsible */}
          {hasInput && (
            <div>
              <button
                type="button"
                onClick={() => setInputExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-[#8B929D] hover:text-[#2F3640] transition-colors"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-150 ${inputExpanded ? "rotate-90" : ""}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
                输入
              </button>
              {inputExpanded && (
                <div className="mt-1.5 rounded-md bg-[#F8F8F8] border border-black/[0.04] px-2.5 py-2 text-[11px] text-[#5A6270] space-y-1">
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
            </div>
          )}

          {/* Output section */}
          {block.output ? (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">输出</div>
              <pre className="rounded-md bg-[#F8F8F8] border border-black/[0.04] px-2.5 py-2 text-[11px] text-[#2F3640] overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">
                {JSON.stringify(block.output, null, 2)}
              </pre>
            </div>
          ) : block.outputSummary ? (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">输出</div>
              <p className="text-xs text-[#2F3640]">{block.outputSummary}</p>
            </div>
          ) : null}

          {/* Image artifacts */}
          {block.artifacts && block.artifacts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">附件</div>
              <div className="flex flex-wrap gap-2">
                {block.artifacts.map((artifact) =>
                  artifact.type === "image" ? (
                    <img
                      key={artifact.url}
                      src={artifact.url}
                      alt={artifact.title ?? "Generated image"}
                      className="max-w-[200px] rounded-md border border-[#E3E3E3]"
                      loading="lazy"
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
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

/** Check if outputSummary looks like a human sentence (not raw JSON) */
function isHumanReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return false;
  return true;
}

/** Format a preview of output key-value pairs (max 3 entries) */
function formatOutputPreview(output: Record<string, unknown>): string[] {
  const entries = Object.entries(output).slice(0, 3);
  return entries.map(([key, value]) => {
    const formattedKey = formatParamName(key);
    let formattedValue: string;
    if (value === null || value === undefined) {
      formattedValue = "—";
    } else if (typeof value === "string") {
      formattedValue = value.length > 80 ? `${value.slice(0, 77)}...` : value;
    } else if (typeof value === "boolean") {
      formattedValue = value ? "Yes" : "No";
    } else if (typeof value === "number") {
      formattedValue = String(value);
    } else if (Array.isArray(value)) {
      formattedValue = `[${value.length} items]`;
    } else {
      formattedValue = "{...}";
    }
    return `${formattedKey}: ${formattedValue}`;
  });
}
