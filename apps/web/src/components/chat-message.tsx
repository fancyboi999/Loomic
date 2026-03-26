"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ContentBlock, ToolArtifact, ToolBlock } from "@loomic/shared";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export type { ContentBlock, ToolArtifact };

/** @deprecated Use ToolBlock from @loomic/shared instead */
export type ToolActivity = ToolBlock; // backward compat

const IMAGE_URL_RE = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i;
const SUPABASE_STORAGE_RE = /supabase\.\w+\/storage\/v1\//i;

function isImageUrl(url: string): boolean {
  return IMAGE_URL_RE.test(url) || SUPABASE_STORAGE_RE.test(url);
}

const markdownComponents: Components = {
  a({ href, children }) {
    if (href && isImageUrl(href)) {
      return (
        <img
          src={href}
          alt={typeof children === "string" ? children : "Image"}
          className="my-2 max-w-[280px] rounded-lg border border-[#E3E3E3]"
          loading="lazy"
        />
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt ?? "Image"}
        className="my-2 max-w-[280px] rounded-lg border border-[#E3E3E3]"
        loading="lazy"
      />
    );
  },
};

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
    const textBlocks = contentBlocks.filter((b) => b.type === "text");
    const imageBlocks = contentBlocks.filter((b) => b.type === "image");
    const text = textBlocks.map((b) => (b as { text: string }).text).join("");

    return (
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex w-full flex-col items-end gap-2 pl-10"
      >
        {imageBlocks.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {imageBlocks.map((block, idx) => (
              <img
                key={idx}
                src={(block as { url: string }).url}
                alt="Attached image"
                className="h-20 w-20 rounded-lg border border-[#E3E3E3] object-cover"
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const fallback = document.createElement("div");
                  fallback.className = "flex h-20 w-20 items-center justify-center rounded-lg border border-[#E3E3E3] bg-[#F7F7F7] text-[10px] text-[#A4A9B2]";
                  fallback.textContent = "Failed";
                  img.parentElement?.insertBefore(fallback, img.nextSibling);
                }}
              />
            ))}
          </div>
        )}
        {text && (
          <div className="inline-block rounded-xl bg-[#F7F7F7] px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#363636]">
            {text}
          </div>
        )}
      </motion.div>
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
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col gap-2 pr-10"
    >
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {block.text}
              </ReactMarkdown>
              {isStreaming && idx === lastTextIdx && (
                <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-[2px] bg-[#2F3640] animate-pulse rounded-full" />
              )}
            </div>
          );
        }

        if (block.type === "tool") {
          return <ToolBlockView key={block.toolCallId} block={block} />;
        }

        // ImageBlock — skip in assistant messages (images are user-side only)
        return null;
      })}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool config                                                        */
/* ------------------------------------------------------------------ */

const TOOL_CONFIG: Record<string, { label: string; icon: string; showCard: boolean }> = {
  inspect_canvas:     { label: "读取画布",   icon: "eye",    showCard: true },
  manipulate_canvas:  { label: "操作画布",   icon: "brush",  showCard: true },
  generate_image:     { label: "生成图片",   icon: "image",  showCard: true },
  generate_video:     { label: "生成视频",   icon: "video",  showCard: true },
  get_brand_kit:      { label: "品牌工具包", icon: "palette", showCard: true },
  project_search:     { label: "搜索项目",   icon: "search", showCard: true },
  task:               { label: "执行任务",   icon: "tool",   showCard: false },
};

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] ?? { label: formatToolName(toolName), icon: "tool", showCard: true };
}

/* ------------------------------------------------------------------ */
/*  ToolIcon                                                           */
/* ------------------------------------------------------------------ */

function ToolIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? "h-3.5 w-3.5";
  switch (type) {
    case "eye":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>;
    case "image":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>;
    case "video":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>;
    case "palette":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.88 2.88M6.75 17.25h.008v.008H6.75v-.008Z" /></svg>;
    case "search":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>;
    case "brush":
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" /></svg>;
    default:
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437" /></svg>;
  }
}

/* ------------------------------------------------------------------ */
/*  ToolBlockView — card in chatbar + floating detail panel            */
/* ------------------------------------------------------------------ */

/** Walk up from an element to find the chatbar container (has inline width style + shrink-0) */
function findSidebarRect(el: HTMLElement | null): DOMRect | null {
  let node = el;
  while (node) {
    if (node.style.width && node.classList.contains("shrink-0")) {
      return node.getBoundingClientRect();
    }
    node = node.parentElement;
  }
  return null;
}

function ToolBlockView({ block }: { block: ToolBlock }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelRight, setPanelRight] = useState(416); // chatbar width + gap
  const containerRef = useRef<HTMLDivElement>(null);

  const config = getToolConfig(block.toolName);
  const isCompleted = block.status === "completed";
  const hasOutput = block.output && Object.keys(block.output).length > 0;
  const hasInput = block.input && Object.keys(block.input).length > 0;
  const hasDetails = hasOutput || hasInput;

  const cardTitle = block.outputSummary && isHumanReadable(block.outputSummary)
    ? block.outputSummary
    : config.label;

  const previewLines = hasOutput ? formatOutputPreview(block.output!) : [];
  const showCard = config.showCard && isCompleted && (block.outputSummary || hasOutput);

  const handleOpenPanel = () => {
    const rect = findSidebarRect(containerRef.current);
    if (rect) {
      // Position panel so its right edge is at the chatbar's left edge minus a gap
      setPanelRight(window.innerWidth - rect.left + 12);
    }
    setPanelOpen(true);
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      {/* Layer 1: Status line */}
      <div className="flex items-center gap-1.5 text-[12px] text-[#A4A9B2]">
        {block.status === "running" ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-[#A4A9B2]/30 border-t-[#A4A9B2]" />
        ) : (
          <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        )}
        <span className="font-medium text-[#525252]">{config.label}</span>
      </div>

      {/* Layer 2: Output card */}
      {showCard && (
        <div className="rounded-xl border-[0.5px] border-[#E5E6EC] p-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-[#F5F5F7] p-1.5 text-[#8B929D]">
              <ToolIcon type={config.icon} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#2F3640] line-clamp-1">
                {cardTitle}
              </div>
              {previewLines.length > 0 && (
                <div className="mt-0.5 space-y-px">
                  {previewLines.map((line, i) => (
                    <div key={i} className="text-[11px] text-[#8B929D] truncate">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {hasDetails && (
            <button
              type="button"
              onClick={handleOpenPanel}
              className="mt-2 flex items-center gap-0.5 text-[12px] text-[#A4A9B2] hover:text-[#525252] transition-colors cursor-pointer"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.78 11.78a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 1.06L6.56 8l3.22 3.22a.75.75 0 0 1 0 1.06Z" />
              </svg>
              查看详情
            </button>
          )}
        </div>
      )}

      {/* Floating detail panel — portal to body, positioned left of chatbar */}
      {panelOpen && hasDetails && createPortal(
        <ToolDetailPanel
          block={block}
          rightOffset={panelRight}
          onClose={() => setPanelOpen(false)}
        />,
        document.body,
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ToolDetailPanel — floating panel to the left of chatbar            */
/* ------------------------------------------------------------------ */

function ToolDetailPanel({
  block,
  rightOffset,
  onClose,
}: {
  block: ToolBlock;
  rightOffset: number;
  onClose: () => void;
}) {
  const [inputExpanded, setInputExpanded] = useState(false);
  const hasInput = block.input && Object.keys(block.input).length > 0;
  const config = getToolConfig(block.toolName);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    // Transparent full-screen overlay — click outside to close
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[1000]"
      onClick={onClose}
    >
      {/* Panel — positioned to the left of chatbar, vertically centered */}
      <motion.div
        initial={{ opacity: 0, x: 24, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="fixed top-1/2 -translate-y-1/2 w-[520px] max-h-[640px] min-h-[240px] rounded-2xl bg-white shadow-lg overflow-hidden flex flex-col"
        style={{ right: rightOffset }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <ToolIcon type={config.icon} className="h-4 w-4 text-[#8B929D]" />
            <h3 className="text-sm font-semibold text-[#2F3640]">{config.label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#A4A9B2] hover:bg-black/[0.04] hover:text-[#2F3640] transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {/* Input — collapsible */}
          {hasInput && (
            <div>
              <button
                type="button"
                onClick={() => setInputExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-[#8B929D] hover:text-[#2F3640] transition-colors"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-200 ${inputExpanded ? "rotate-90" : ""}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
                输入参数
              </button>
              {inputExpanded && (
                <div className="mt-2 space-y-1.5">
                  {Object.entries(block.input!).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-[#F8F8FA] px-3 py-2">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-[#A4A9B2]">
                        {formatParamName(key)}
                      </div>
                      <div className="mt-0.5 text-xs text-[#2F3640] break-all whitespace-pre-wrap">
                        {formatParamValue(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Output — tool-specific renderers */}
          {block.output ? (
            <ToolOutputRenderer toolName={block.toolName} output={block.output} />
          ) : block.outputSummary ? (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-2">输出</div>
              <div className="rounded-lg bg-[#F8F8FA] px-3 py-2.5 text-sm leading-relaxed text-[#2F3640] whitespace-pre-wrap break-words">
                {block.outputSummary}
              </div>
            </div>
          ) : null}

          {/* Image artifacts */}
          {block.artifacts && block.artifacts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-2">附件</div>
              <div className="flex flex-wrap gap-2">
                {block.artifacts.map((artifact) =>
                  artifact.type === "image" ? (
                    <img
                      key={artifact.url}
                      src={artifact.url}
                      alt={artifact.title ?? "Generated image"}
                      className="max-w-[200px] rounded-lg border border-[#E3E3E3]"
                      loading="lazy"
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool-specific output renderers                                     */
/* ------------------------------------------------------------------ */

function ToolOutputRenderer({ toolName, output }: { toolName: string; output: Record<string, unknown> }) {
  if (toolName === "get_brand_kit" && isBrandKitOutput(output)) {
    return <BrandKitOutput data={output} />;
  }

  // Try to render key-value pairs nicely for simple objects
  const entries = Object.entries(output);
  const isSimple = entries.every(
    ([, v]) => v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  );

  if (isSimple && entries.length > 0) {
    return (
      <div>
        <div className="text-xs font-medium text-[#8B929D] mb-2">输出</div>
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-[#F8F8FA] px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-[#A4A9B2]">
                {formatParamName(key)}
              </div>
              <div className="mt-0.5 text-sm text-[#2F3640] whitespace-pre-wrap break-words">
                {value === null ? "—" : String(value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Complex objects / arrays — formatted JSON with syntax highlighting
  return (
    <div>
      <div className="text-xs font-medium text-[#8B929D] mb-2">输出</div>
      <div className="rounded-xl bg-[#1E1E1E] px-4 py-3 overflow-x-auto max-h-[360px] overflow-y-auto">
        <pre className="text-[12px] leading-5 text-[#D4D4D4] whitespace-pre-wrap break-all font-mono">
          {JSON.stringify(output, null, 2)}
        </pre>
      </div>
    </div>
  );
}

type BrandKitData = {
  kit_name?: string;
  design_guidance?: string;
  colors?: { name?: string; hex?: string; role?: string | null }[];
  fonts?: { name?: string; family?: string; weight?: string; role?: string | null }[];
  logos?: { name?: string; url?: string; role?: string | null }[];
  images?: { name?: string; url?: string; role?: string | null }[];
};

function isBrandKitOutput(output: Record<string, unknown>): output is BrandKitData {
  return "colors" in output || "fonts" in output || "logos" in output || "kit_name" in output;
}

function BrandKitOutput({ data }: { data: BrandKitData }) {
  const colors = data.colors?.filter((c) => c.hex) ?? [];
  const fonts = data.fonts?.filter((f) => f.name) ?? [];
  const logos = data.logos?.filter((l) => l.url) ?? [];
  const images = data.images?.filter((i) => i.url) ?? [];

  return (
    <div className="space-y-4">
      {data.kit_name && (
        <div>
          <div className="text-base font-semibold text-[#2F3640]">{data.kit_name}</div>
          {data.design_guidance && (
            <div className="mt-0.5 text-xs text-[#8B929D]">{data.design_guidance}</div>
          )}
        </div>
      )}

      {/* Colors */}
      {colors.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[#8B929D] mb-2">Color</div>
          <div className="flex flex-wrap gap-3">
            {colors.map((color, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className="h-16 w-16 rounded-xl border border-black/[0.06] shadow-sm"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-[10px] font-medium text-[#525252]">{color.hex}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fonts */}
      {fonts.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[#8B929D] mb-2">Fonts</div>
          <div className="grid grid-cols-2 gap-2">
            {fonts.map((font, i) => (
              <div key={i} className="rounded-xl bg-[#F5F5F7] px-3 py-3">
                <div className="text-[10px] text-[#8B929D] mb-1">{font.name}</div>
                <div className="text-sm text-[#2F3640]" style={{ fontFamily: font.family }}>
                  ABCDEFGHIJKLM
                </div>
                <div className="text-xs text-[#2F3640] mt-0.5" style={{ fontFamily: font.family }}>
                  abcdefghijklmnopqrstuvwxyz
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logos & Images */}
      {(logos.length > 0 || images.length > 0) && (
        <div>
          <div className="text-xs font-medium text-[#8B929D] mb-2">Photography</div>
          <div className="grid grid-cols-2 gap-2">
            {logos.map((logo, i) => (
              <div key={`logo-${i}`} className="overflow-hidden rounded-xl border border-black/[0.04]">
                <img
                  src={logo.url}
                  alt={logo.name ?? "Logo"}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
                {logo.name && (
                  <div className="px-2 py-1.5 text-[10px] text-[#8B929D] truncate">{logo.name}</div>
                )}
              </div>
            ))}
            {images.map((img, i) => (
              <div key={`img-${i}`} className="overflow-hidden rounded-xl border border-black/[0.04]">
                <img
                  src={img.url}
                  alt={img.name ?? "Image"}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
                {img.name && (
                  <div className="px-2 py-1.5 text-[10px] text-[#8B929D] truncate">{img.name}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility functions                                                   */
/* ------------------------------------------------------------------ */

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

function isHumanReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return false;
  return true;
}

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
