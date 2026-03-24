"use client";

import { useCallback, useRef, useState } from "react";

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
};

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

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

  const hasContent = value.trim().length > 0;

  return (
    <div className="px-2 pb-2">
      <div className="flex min-h-[100px] flex-col justify-between gap-2 rounded-xl border-[0.5px] border-[#E3E3E3] bg-white p-2 transition-colors focus-within:border-[#C0C0C0]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Start with an idea, or type &quot;@&quot; to mention"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent px-1 text-sm leading-[1.8] text-[#141414] placeholder:text-[#A4A9B2] focus:outline-none disabled:opacity-50"
        />
        <div className="flex items-center justify-end">
          <button
            onClick={handleSubmit}
            disabled={disabled || !hasContent}
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
