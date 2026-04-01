"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { MessageMention } from "@loomic/shared";
import type { ImageAttachmentState } from "../hooks/use-image-attachments";
import type { CanvasSelectedElement } from "./canvas-editor";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";
import { AgentModelSelector } from "./agent-model-selector";
import { ImageAttachmentBar } from "./image-attachment-bar";
import { ImageModelPreferencePopover } from "./image-model-preference";

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  isUploading?: boolean;
  onAtQuery?: (query: string | null) => void;
  mentions?: MessageMention[];
  onRemoveMention?: (mention: MessageMention) => void;
  selectedCanvasElements?: CanvasSelectedElement[];
};

export type ChatInputHandle = {
  /** Remove the @query text from input after picker selection */
  clearAtQuery: () => void;
};

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onRetryAttachment,
  isUploading,
  onAtQuery,
  mentions,
  onRemoveMention,
  selectedCanvasElements,
}, ref) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { preference } = useImageModelPreference();
  const { preference: videoPreference } = useVideoModelPreference();
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({
    clearAtQuery() {
      setValue((prev) => {
        const lastAtIdx = prev.lastIndexOf("@");
        if (lastAtIdx === -1) return prev;
        return prev.slice(0, lastAtIdx);
      });
    },
  }));

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && (!attachments || attachments.length === 0)) || disabled || isUploading) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, isUploading, onSend, attachments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Auto-resize textarea when value changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxH = 240; // max-h-60
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxH ? "auto" : "hidden";
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      if (!onAtQuery) return;

      // Find last @ in text to detect mention mode
      const lastAtIdx = newValue.lastIndexOf("@");
      if (lastAtIdx === -1) {
        onAtQuery(null); // close picker
        return;
      }

      // Only trigger if @ is at start or preceded by whitespace
      const charBefore = lastAtIdx > 0 ? newValue[lastAtIdx - 1] : " ";
      if (charBefore !== " " && charBefore !== "\n" && lastAtIdx !== 0) {
        onAtQuery(null);
        return;
      }

      // Extract query after @
      const query = newValue.slice(lastAtIdx + 1);
      // Close if user typed a space after query (finished mentioning)
      if (query.includes(" ") || query.includes("\n")) {
        onAtQuery(null);
        return;
      }

      onAtQuery(query);
    },
    [onAtQuery],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onAddFiles) {
        onAddFiles(Array.from(files));
      }
      e.target.value = "";
    },
    [onAddFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!onAddFiles) return;
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!onAddFiles) return;
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );

  const hasContent = value.trim().length > 0 || (attachments && attachments.length > 0);

  // Compute canvas selection summary for the context bar
  const selectionImageCount = selectedCanvasElements?.filter((el) => el.type === "image").length ?? 0;
  const selectionShapeCount = (selectedCanvasElements?.length ?? 0) - selectionImageCount;
  const hasSelection = (selectedCanvasElements?.length ?? 0) > 0;

  return (
    <div className="px-2 pb-2">
      <div
        className="flex min-h-[120px] flex-col justify-between gap-2 rounded-xl border-[0.5px] border-border bg-card p-2 transition-[border] focus-within:border-border"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {hasSelection && (
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg">
            <div className="flex items-center gap-1.5 min-w-0">
              {selectionImageCount > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  {selectionImageCount} {selectionImageCount === 1 ? "image" : "images"}
                </span>
              )}
              {selectionImageCount > 0 && selectionShapeCount > 0 && (
                <span className="text-muted-foreground/40">&middot;</span>
              )}
              {selectionShapeCount > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                  </svg>
                  {selectionShapeCount} {selectionShapeCount === 1 ? "shape" : "shapes"}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground/60">selected on canvas</span>
            </div>
          </div>
        )}
        {attachments && onRemoveAttachment && (
          <ImageAttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
            {...(onRetryAttachment ? { onRetry: onRetryAttachment } : {})}
          />
        )}
        {mentions && mentions.length > 0 && onRemoveMention && (
          <div className="flex flex-wrap items-center gap-1 px-2 py-1">
            {mentions.map((mention) => (
              <button
                key={`${mention.mentionType}:${mention.id}`}
                type="button"
                onClick={() => onRemoveMention(mention)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted/80"
                title="Remove mention"
              >
                <span className="text-muted-foreground">@</span>
                <span className="max-w-[180px] truncate">
                  {mention.label}
                </span>
                <svg
                  className="h-3 w-3 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          data-chat-input
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder='Start with an idea, or type "@" to mention'
          rows={1}
          style={{ scrollbarWidth: "none" }}
          className="min-h-[48px] max-h-60 resize-none bg-transparent px-1 text-sm leading-[1.8] text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-scrollbar]:hidden"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {onAddFiles && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Attach images"
                >
                  <svg
                    className="h-[14px] w-[14px]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M16 1.1A4.9 4.9 0 0 1 20.9 6a4.9 4.9 0 0 1-1.429 3.457h.001l-8.414 8.587-.007.006a2.9 2.9 0 0 1-3.887.193l-.213-.192a2.9 2.9 0 0 1-.007-4.095l8.414-8.586a.9.9 0 0 1 1.286 1.26L8.23 15.216l-.007.006a1.1 1.1 0 0 0 1.556 1.555l8.407-8.579.007-.007a3.1 3.1 0 0 0 .105-4.271l-.105-.112a3.1 3.1 0 0 0-4.384 0L5.4 12.387l-.007.006a5.1 5.1 0 0 0 7.214 7.213l7.749-7.934a.9.9 0 0 1 1.288 1.256l-7.753 7.938q-.005.007-.012.014a6.9 6.9 0 0 1-9.758-9.76l8.408-8.578.007-.007A4.9 4.9 0 0 1 16 1.1" />
                  </svg>
                </button>
              </>
            )}
            {/* Agent model selector */}
            <AgentModelSelector compact />
            {/* Model preference button */}
            <div className="relative">
              <button
                ref={modelBtnRef}
                type="button"
                onClick={() => setModelPopoverOpen((prev) => !prev)}
                title="Image model"
                className={`flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] transition-colors ${
                  preference.mode === "manual" || videoPreference.mode === "manual"
                    ? "border-accent bg-accent/20 text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.8 1.307a2.33 2.33 0 0 1 2.4 0l7.67 4.602A2.33 2.33 0 0 1 22 7.907v8.361a2.33 2.33 0 0 1-1.13 1.998l-7.67 4.602-.141.078a2.33 2.33 0 0 1-2.258-.078l-7.67-4.602A2.33 2.33 0 0 1 2 16.268V7.907a2.33 2.33 0 0 1 1.003-1.915l.128-.083z" />
                </svg>
              </button>
              <ImageModelPreferencePopover
                open={modelPopoverOpen}
                onClose={() => setModelPopoverOpen(false)}
                anchorRef={modelBtnRef}
              />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={disabled || !hasContent || isUploading}
            className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-[#2F3640] text-white transition-colors hover:bg-[#4A535F] active:bg-[#191E26] disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <svg
              className="h-[14px] w-[14px]"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            >
              <path d="M7 11.5V2.5" />
              <path d="M3 6.5L7 2.5L11 6.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});
