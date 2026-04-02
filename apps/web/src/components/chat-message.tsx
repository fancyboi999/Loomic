"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ContentBlock, ThinkingBlock, ToolArtifact, ToolBlock } from "@loomic/shared";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/* ------------------------------------------------------------------ */
/*  ImageLightbox — click-to-zoom overlay                              */
/* ------------------------------------------------------------------ */

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flipX, setFlipX] = useState(1);
  const [flipY, setFlipY] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });

  const handleZoomIn = useCallback(() => setScale((s) => Math.min(s * 1.25, 8)), []);
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s / 1.25, 0.25)), []);
  const handleRotateCW = useCallback(() => setRotate((r) => r + 90), []);
  const handleRotateCCW = useCallback(() => setRotate((r) => r - 90), []);
  const handleFlipX = useCallback(() => setFlipX((f) => f * -1), []);
  const handleFlipY = useCallback(() => setFlipY((f) => f * -1), []);
  const handleReset = useCallback(() => { setScale(1); setRotate(0); setFlipX(1); setFlipY(1); setTranslate({ x: 0, y: 0 }); }, []);
  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = alt || "image";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    }
  }, [src, alt]);

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-") handleZoomOut();
      if (e.key === "r") handleRotateCW();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleZoomIn, handleZoomOut, handleRotateCW]);

  // Wheel zoom — bound to overlay element to avoid being intercepted
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) setScale((s) => Math.min(s * 1.1, 8));
      else setScale((s) => Math.max(s / 1.1, 0.25));
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: translate.x, origY: translate.y };
  }, [scale, translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    setTranslate({ x: d.origX + e.clientX - d.startX, y: d.origY + e.clientY - d.startY });
  }, []);

  const handlePointerUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  return createPortal(
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center w-full overflow-hidden"
        onClick={onClose}
      >
        <img
          draggable
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] object-contain select-none"
          style={{
            transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale3d(${scale * flipX}, ${scale * flipY}, 1) rotate(${rotate}deg)`,
            transition: dragRef.current.dragging ? "none" : "transform 0.2s ease",
            cursor: scale > 1 ? "grab" : "default",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>

      {/* Close button — top right */}
      <button
        type="button"
        title="关闭 (Esc)"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Toolbar */}
      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1.5 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <LightboxBtn title="缩小 (-)" onClick={handleZoomOut}>
          <path d="M5 12h14" />
        </LightboxBtn>
        <span className="min-w-[42px] text-center text-xs text-white/80 select-none">
          {Math.round(scale * 100)}%
        </span>
        <LightboxBtn title="放大 (+)" onClick={handleZoomIn}>
          <path d="M12 5v14M5 12h14" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="左右翻转" onClick={handleFlipX}>
          <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
          <path d="M12 20V4" />
        </LightboxBtn>
        <LightboxBtn title="上下翻转" onClick={handleFlipY}>
          <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
          <path d="M4 12h16" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="逆时针旋转" onClick={handleRotateCCW}>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
          <path d="M3 3v5h5" />
        </LightboxBtn>
        <LightboxBtn title="顺时针旋转 (R)" onClick={handleRotateCW}>
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </LightboxBtn>
        <div className="mx-1 h-4 w-px bg-white/20" />
        <LightboxBtn title="重置" onClick={handleReset}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </LightboxBtn>
        <LightboxBtn title="下载" onClick={handleDownload}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </LightboxBtn>
      </div>
    </motion.div>,
    document.body,
  );
}

function LightboxBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
    >
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

/** Clickable image thumbnail that opens a lightbox on click. */
function ChatImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} cursor-zoom-in`}
        loading="lazy"
        onClick={() => setOpen(true)}
      />
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Inline pill for user-attached images — compact, hover preview, click lightbox. */
function ImagePill({ src, name }: { src: string; name: string }) {
  const [lightbox, setLightbox] = useState(false);
  const [preview, setPreview] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    const above = rect.top > 260;
    setPreview({
      x: rect.left + rect.width / 2,
      y: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  }, []);

  const handleMouseLeave = useCallback(() => setPreview(null), []);

  return (
    <>
      <span
        ref={pillRef}
        onClick={() => setLightbox(true)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex h-[22px] items-center gap-1 rounded-md px-1 mx-0.5 border-[0.5px] border-muted-foreground text-foreground hover:bg-muted cursor-pointer align-middle"
      >
        <span className="inline-block relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-sm">
          <img
            src={src}
            alt={name}
            draggable={false}
            className="h-full w-full object-cover"
          />
        </span>
        <span className="max-w-[100px] truncate text-[11px] leading-none text-foreground">{name}</span>
      </span>
      {/* Hover preview — portal to body, auto direction */}
      {preview && createPortal(
        <div
          className="pointer-events-none fixed z-[1500]"
          style={{
            left: preview.x,
            top: preview.above ? preview.y : undefined,
            bottom: preview.above ? undefined : `${window.innerHeight - preview.y}px`,
            transform: preview.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          }}
        >
          <img
            src={src}
            alt={name}
            className="max-h-[240px] max-w-[240px] rounded-lg border border-border object-contain bg-card shadow-xl"
          />
        </div>,
        document.body,
      )}
      {lightbox && <ImageLightbox src={src} alt={name} onClose={() => setLightbox(false)} />}
    </>
  );
}

function MentionPill({
  label,
  kind,
}: {
  label: string;
  kind: "image-model" | "brand-kit-asset";
}) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 mx-0.5 border-[0.5px] border-muted-foreground text-foreground align-middle">
      <span className="text-[10px] leading-none text-muted-foreground">
        {kind === "image-model" ? "Model" : "Brand"}
      </span>
      <span className="max-w-[120px] truncate text-[11px] leading-none text-foreground">
        {label}
      </span>
    </span>
  );
}

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
        <ChatImage
          src={href}
          alt={typeof children === "string" ? children : "Image"}
          className="my-2 max-w-[280px] rounded-lg border border-border"
        />
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-foreground underline break-all">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    return (
      <ChatImage
        src={typeof src === "string" ? src : ""}
        alt={alt ?? "Image"}
        className="my-2 max-w-[280px] rounded-lg border border-border"
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
    const mentionBlocks = contentBlocks.filter(
      (b) => b.type === "mention",
    );
    const text = textBlocks.map((b) => (b as { text: string }).text).join("");

    return (
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex w-full flex-col items-end gap-2 pl-10"
      >
        {text && (
          <div className="inline-block rounded-xl bg-muted px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-foreground">
            <span className="cursor-text select-text [word-break:break-word]">{text}</span>
            {mentionBlocks.length > 0 && (
              <span className="inline">
                {mentionBlocks.map((block, idx) => (
                  <MentionPill
                    key={idx}
                    label={(block as { label: string }).label}
                    kind={
                      (block as { mentionType: "image-model" | "brand-kit-asset" })
                        .mentionType
                    }
                  />
                ))}
              </span>
            )}
            {imageBlocks.length > 0 && (
              <span className="inline">
                {imageBlocks.map((block, idx) => (
                  <ImagePill
                    key={idx}
                    src={(block as { url: string }).url}
                    name={
                      (block as { name?: string }).name ??
                      `image-${idx + 1}`
                    }
                  />
                ))}
              </span>
            )}
          </div>
        )}
        {!text && (imageBlocks.length > 0 || mentionBlocks.length > 0) && (
          <div className="inline-block rounded-xl bg-muted px-3 py-2.5">
            {mentionBlocks.map((block, idx) => (
              <MentionPill
                key={`mention-${idx}`}
                label={(block as { label: string }).label}
                kind={
                  (block as { mentionType: "image-model" | "brand-kit-asset" })
                    .mentionType
                }
              />
            ))}
            {imageBlocks.map((block, idx) => (
              <ImagePill
                key={idx}
                src={(block as { url: string }).url}
                name={
                  (block as { name?: string }).name ??
                  `image-${idx + 1}`
                }
              />
            ))}
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
    (b) =>
      (b.type === "text" && b.text.length > 0) ||
      b.type === "tool" ||
      b.type === "thinking",
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
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>思考中</span>
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground animate-bounce-dot"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      )}
      {contentBlocks.map((block, idx) => {
        if (block.type === "thinking") {
          return (
            <ThinkingBlockView
              key={`thinking-${idx}`}
              thinking={block.thinking}
              isStreaming={!!isStreaming && idx === contentBlocks.length - 1}
            />
          );
        }

        if (block.type === "text") {
          return (
            <div
              key={idx}
              className="markdown-content text-sm leading-[1.6] text-foreground"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {block.text}
              </ReactMarkdown>
              {isStreaming && idx === lastTextIdx && (
                <span className="inline-block w-[2px] h-[14px] ml-0.5 -mb-[2px] bg-foreground animate-pulse rounded-full" />
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
/*  ThinkingBlockView — collapsible thinking content with animation    */
/* ------------------------------------------------------------------ */

function ThinkingBlockView({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mb-2 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        {isStreaming ? (
          <motion.div
            className="flex items-center gap-1.5"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" className="text-accent">
              <path d="M7.314 1.451a5.527 5.527 0 0 0 5.519 5.242v.614a5.527 5.527 0 0 0-5.519 5.242l-.007.284h-.614l-.007-.284a5.527 5.527 0 0 0-5.519-5.242v-.614a5.527 5.527 0 0 0 5.519-5.242l.007-.284h.614zm4.31 8.125c.042.835.733 1.5 1.58 1.5v.176c-.847 0-1.538.664-1.58 1.5l-.002.081h-.176l-.002-.081a1.58 1.58 0 0 0-1.579-1.5v-.176c.846 0 1.537-.665 1.58-1.5l.001-.08h.176zM7 4.204A6.6 6.6 0 0 1 4.205 7 6.6 6.6 0 0 1 7 9.795 6.6 6.6 0 0 1 9.794 7 6.6 6.6 0 0 1 7 4.204" />
            </svg>
            <span>Thinking...</span>
          </motion.div>
        ) : (
          <>
            <motion.svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
            <span>Thought for a moment</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {(expanded || isStreaming) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1.5 overflow-hidden"
          >
            <div className="border-l-2 border-accent/30 pl-3 text-xs leading-relaxed text-muted-foreground/60 whitespace-pre-wrap">
              {thinking}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool config                                                        */
/* ------------------------------------------------------------------ */

const TOOL_CONFIG: Record<string, { label: string; icon: string; showCard: boolean }> = {
  think:              { label: "思考中",     icon: "tool",   showCard: false },
  inspect_canvas:     { label: "读取画布",   icon: "eye",    showCard: true },
  manipulate_canvas:  { label: "操作画布",   icon: "brush",  showCard: true },
  generate_image:     { label: "生成图片",   icon: "image",  showCard: true },
  generate_video:     { label: "生成视频",   icon: "video",  showCard: true },
  screenshot_canvas:  { label: "截取画布",   icon: "eye",    showCard: true },
  get_brand_kit:      { label: "品牌工具包", icon: "palette", showCard: true },
  project_search:     { label: "搜索项目",   icon: "search", showCard: true },
  task:               { label: "执行任务",   icon: "tool",   showCard: false },
};

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] ?? { label: formatToolName(toolName), icon: "tool", showCard: true };
}

/** Format raw model ID to human-readable name: "google/nano-banana-pro" → "Nano Banana Pro" */
function formatModelDisplayName(model: string): string {
  const slug = model.split("/").pop() ?? model;
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
  const [panelRight, setPanelRight] = useState(416);
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

  // Extract artifacts for generate_image / generate_video inline preview
  const imageArtifact = block.artifacts?.find((a) => a.type === "image");
  const isImageTool = block.toolName === "generate_image";
  const isVideoTool = block.toolName === "generate_video";
  const isMediaTool = isImageTool || isVideoTool;
  const mediaError = isMediaTool && isCompleted && !imageArtifact
    ? (block.output as Record<string, unknown> | undefined)?.error as string | undefined
    : undefined;
  const inputData = block.input as Record<string, unknown> | undefined;
  const modelName = inputData?.model as string | undefined;
  // Use agent-specified aspect ratio for shimmer placeholder, fall back to sensible defaults
  const aspectRatio = (inputData?.aspectRatio as string) ?? (isVideoTool ? "16:9" : "1:1");

  const handleOpenPanel = () => {
    const rect = findSidebarRect(containerRef.current);
    if (rect) {
      setPanelRight(window.innerWidth - rect.left + 12);
    }
    setPanelOpen(true);
  };

  return (
    <div ref={containerRef} className="space-y-1.5">
      {/* Layer 1: Status line */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        {block.status === "running" ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground" />
        ) : (
          <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        )}
        <span className="font-medium text-muted-foreground">
          {isMediaTool && modelName
            ? formatModelDisplayName(modelName)
            : config.label}
        </span>
      </div>

      {/* Layer 2a: Media generation shimmer placeholder — shown while generating (image or video) */}
      {isMediaTool && !isCompleted && (
        <div className="rounded-xl border-[0.5px] border-border overflow-hidden">
          {/* Shimmer area — uses actual aspect ratio from tool input */}
          <div className="relative w-full max-h-[280px] overflow-hidden" style={{ aspectRatio: aspectRatio.replace(":", " / ") }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
              {isVideoTool ? (
                <svg className="h-10 w-10 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              ) : (
                <svg className="h-10 w-10 text-muted-foreground/50" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
              )}
            </div>
            {/* Shimmer scan effect */}
            <div className="absolute inset-0 animate-shimmer-scan">
              <div
                className="h-full w-1/2"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                }}
              />
            </div>
          </div>
          {/* Model info footer */}
          <div className="px-3 py-2">
            <div className="text-[12px] font-medium text-muted-foreground/70">
              {isVideoTool ? "视频生成中..." : "图片生成中..."}
            </div>
            {modelName && (
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {formatModelDisplayName(modelName)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Layer 2b-err: Media generation failed — error card */}
      {isMediaTool && isCompleted && !imageArtifact && mediaError && (
        <div className="rounded-xl border-[0.5px] border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 shrink-0 rounded-lg bg-destructive/10 p-1.5 text-destructive">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {isVideoTool ? "视频生成失败" : "图片生成失败"}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">
                {mediaError}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Layer 2b: Image generation card — special layout with inline preview */}
      {isImageTool && isCompleted && imageArtifact ? (
        <div
          className="group cursor-pointer rounded-xl border-[0.5px] border-border overflow-hidden transition-shadow hover:shadow-md"
          onClick={handleOpenPanel}
        >
          {/* Image preview */}
          <div className="relative aspect-square max-h-[280px] w-full overflow-hidden bg-muted">
            <img
              src={imageArtifact.url}
              alt={imageArtifact.title ?? "Generated image"}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
            {/* Gradient overlay with download button */}
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetch(imageArtifact.url)
                    .then((res) => res.blob())
                    .then((blob) => {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = (imageArtifact as { title?: string }).title ?? "generated-image.png";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    })
                    .catch(() => window.open(imageArtifact.url, "_blank"));
                }}
                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
                title="下载图片"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06Z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Title + model info */}
          <div className="px-3 py-2.5">
            <div className="text-sm font-semibold text-foreground line-clamp-1">
              {(imageArtifact as { title?: string }).title ?? cardTitle}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {modelName && (
                <span className="truncate">{formatModelDisplayName(modelName)}</span>
              )}
              {hasDetails && (
                <>
                  <span>·</span>
                  <span className="hover:text-foreground transition-colors">查看详情</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : showCard ? (
        /* Layer 2: Generic output card (non-image tools) */
        <div className="rounded-xl border-[0.5px] border-border p-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-1.5 text-muted-foreground">
              <ToolIcon type={config.icon} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground line-clamp-1">
                {cardTitle}
              </div>
              {previewLines.length > 0 && (
                <div className="mt-0.5 space-y-px">
                  {previewLines.map((line, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground truncate">
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
              className="mt-2 flex items-center gap-0.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.78 11.78a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 1.06L6.56 8l3.22 3.22a.75.75 0 0 1 0 1.06Z" />
              </svg>
              查看详情
            </button>
          )}
        </div>
      ) : null}

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
        className="fixed top-1/2 -translate-y-1/2 w-[520px] max-h-[640px] min-h-[240px] rounded-2xl bg-card shadow-lg overflow-hidden flex flex-col"
        style={{ right: rightOffset }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <ToolIcon type={config.icon} className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
                    <div key={key} className="rounded-lg bg-muted px-3 py-2">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {formatParamName(key)}
                      </div>
                      <div className="mt-0.5 text-xs text-foreground break-all whitespace-pre-wrap">
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
              <div className="text-xs font-medium text-muted-foreground mb-2">输出</div>
              <div className="rounded-lg bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                {block.outputSummary}
              </div>
            </div>
          ) : null}

          {/* Image artifacts */}
          {block.artifacts && block.artifacts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">附件</div>
              <div className="flex flex-wrap gap-2">
                {block.artifacts.map((artifact) =>
                  artifact.type === "image" ? (
                    <ChatImage
                      key={artifact.url}
                      src={artifact.url}
                      alt={artifact.title ?? "Generated image"}
                      className="max-w-[200px] rounded-lg border border-border"
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
        <div className="text-xs font-medium text-muted-foreground mb-2">输出</div>
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {formatParamName(key)}
              </div>
              <div className="mt-0.5 text-sm text-foreground whitespace-pre-wrap break-words">
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
      <div className="text-xs font-medium text-muted-foreground mb-2">输出</div>
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
          <div className="text-base font-semibold text-foreground">{data.kit_name}</div>
          {data.design_guidance && (
            <div className="mt-0.5 text-xs text-muted-foreground">{data.design_guidance}</div>
          )}
        </div>
      )}

      {/* Colors */}
      {colors.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Color</div>
          <div className="flex flex-wrap gap-3">
            {colors.map((color, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className="h-16 w-16 rounded-xl border border-border shadow-sm"
                  style={{ backgroundColor: color.hex }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{color.hex}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fonts */}
      {fonts.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Fonts</div>
          <div className="grid grid-cols-2 gap-2">
            {fonts.map((font, i) => (
              <div key={i} className="rounded-xl bg-muted px-3 py-3">
                <div className="text-[10px] text-muted-foreground mb-1">{font.name}</div>
                <div className="text-sm text-foreground" style={{ fontFamily: font.family }}>
                  ABCDEFGHIJKLM
                </div>
                <div className="text-xs text-foreground mt-0.5" style={{ fontFamily: font.family }}>
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
          <div className="text-xs font-medium text-muted-foreground mb-2">Photography</div>
          <div className="grid grid-cols-2 gap-2">
            {logos.map((logo, i) => (
              <div key={`logo-${i}`} className="overflow-hidden rounded-xl border border-border">
                <img
                  src={logo.url}
                  alt={logo.name ?? "Logo"}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
                {logo.name && (
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate">{logo.name}</div>
                )}
              </div>
            ))}
            {images.map((img, i) => (
              <div key={`img-${i}`} className="overflow-hidden rounded-xl border border-border">
                <img
                  src={img.url}
                  alt={img.name ?? "Image"}
                  className="h-auto w-full object-cover"
                  loading="lazy"
                />
                {img.name && (
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground truncate">{img.name}</div>
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
