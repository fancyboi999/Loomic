"use client";

import { useCallback, useRef, useState } from "react";

import type { ImageAttachmentState } from "../hooks/use-image-attachments";
import { ImageAttachmentBar } from "./image-attachment-bar";

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  isUploading?: boolean;
  onAtTrigger?: () => void;
};

export function ChatInput({
  onSend,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onRetryAttachment,
  isUploading,
  onAtTrigger,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      // Detect @ trigger — remove the @ character and open picker
      if (onAtTrigger && newValue.endsWith("@")) {
        setValue(newValue.slice(0, -1));
        onAtTrigger();
        return;
      }
      setValue(newValue);
    },
    [onAtTrigger],
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

  const hasContent = value.trim().length > 0 || (attachments && attachments.length > 0);

  return (
    <div className="px-2 pb-2">
      <div
        className="flex min-h-[100px] flex-col justify-between gap-2 rounded-xl border-[0.5px] border-[#E3E3E3] bg-white p-2 transition-colors focus-within:border-[#C0C0C0]"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {attachments && onRemoveAttachment && (
          <ImageAttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
            onRetry={onRetryAttachment}
          />
        )}
        <textarea
          ref={textareaRef}
          data-chat-input
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder='Start with an idea, or type "@" to mention'
          rows={1}
          className="flex-1 resize-none bg-transparent px-1 text-sm leading-[1.8] text-[#141414] placeholder:text-[#A4A9B2] focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center">
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
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#A4A9B2] transition-colors hover:bg-black/[0.04] hover:text-[#525252]"
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
          </div>
          <button
            onClick={handleSubmit}
            disabled={disabled || !hasContent || isUploading}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0C0C0D] text-white transition-opacity hover:opacity-80 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M3 14V2l11 6z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
