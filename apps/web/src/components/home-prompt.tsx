"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { ImageAttachment } from "@loomic/shared";
import type { ImageAttachmentState } from "../hooks/use-image-attachments";
import { ImageAttachmentBar } from "./image-attachment-bar";

export type HomePromptHandle = {
  /** Programmatically set the textarea value (e.g. from an example pill). */
  fill: (text: string) => void;
};

type HomePromptProps = {
  onSubmit: (prompt: string, attachments?: ImageAttachment[]) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  readyAttachments?: ImageAttachment[];
};

const toolbarButtons = [
  {
    name: "Attach",
    viewBox: "0 0 24 24",
    path: "M16 1.1A4.9 4.9 0 0 1 20.9 6a4.9 4.9 0 0 1-1.429 3.457h.001l-8.414 8.587-.007.006a2.9 2.9 0 0 1-3.887.193l-.213-.192a2.9 2.9 0 0 1-.007-4.095l8.414-8.586a.9.9 0 0 1 1.286 1.26L8.23 15.216l-.007.006a1.1 1.1 0 0 0 1.556 1.555l8.407-8.579.007-.007a3.1 3.1 0 0 0 .105-4.271l-.105-.112a3.1 3.1 0 0 0-4.384 0L5.4 12.387l-.007.006a5.1 5.1 0 0 0 7.214 7.213l7.749-7.934a.9.9 0 0 1 1.288 1.256l-7.753 7.938q-.005.007-.012.014a6.9 6.9 0 0 1-9.758-9.76l8.408-8.578.007-.007A4.9 4.9 0 0 1 16 1.1",
  },
  {
    name: "Inspire",
    viewBox: "0 0 24 24",
    path: "M15.485 20.14c.284 0 .515.23.515.515 0 .71-.576 1.285-1.286 1.285H9.286c-.71 0-1.286-.575-1.286-1.285 0-.284.23-.515.515-.515zM12 1.334a8 8 0 0 1 4 14.926v1.414c0 .737-.597 1.333-1.333 1.333H9.333A1.333 1.333 0 0 1 8 17.674V16.26a8 8 0 0 1 4-14.927",
  },
  {
    name: "Quick",
    viewBox: "0 0 24 24",
    path: "M11.675.965c.517-.26 1.263-.444 2.051-.143.784.3 1.217.93 1.432 1.46.213.525.281 1.098.281 1.635V8.98h2.093l.352.015c.864.07 1.997.425 2.513 1.59.553 1.249-.06 2.406-.615 3.088l-6.085 8.208a2 2 0 0 1-.085.106c-.35.405-.778.793-1.287 1.049-.518.26-1.264.444-2.052.142-.783-.3-1.216-.928-1.431-1.459-.214-.524-.282-1.097-.282-1.634V15.02H6.468c-.88 0-2.276-.275-2.866-1.607-.552-1.248.06-2.405.616-3.087l6.085-8.207.084-.106c.35-.405.778-.794 1.287-1.05m1.964 2.952c0-1.602-.851-1.926-1.89-.725L5.664 11.4c-.87 1-.506 1.821.804 1.822H9.36a1 1 0 0 1 1 1v5.864l.01.285c.091 1.26.803 1.53 1.688.646l.193-.207 6.086-8.209c.87-1 .505-1.82-.805-1.82h-2.893l-.102-.005a1 1 0 0 1-.893-.892l-.005-.103z",
  },
  {
    name: "Web",
    viewBox: "0 0 24 24",
    path: "M11.645 1c6.074 0 11 4.925 11 11s-4.926 11-11 11c-6.075 0-11-4.925-11-11s4.925-11 11-11",
  },
  {
    name: "Agent",
    viewBox: "0 0 24 24",
    path: "M10.8 1.307a2.33 2.33 0 0 1 2.4 0l7.67 4.602A2.33 2.33 0 0 1 22 7.907v8.361a2.33 2.33 0 0 1-1.13 1.998l-7.67 4.602-.141.078a2.33 2.33 0 0 1-2.258-.078l-7.67-4.602A2.33 2.33 0 0 1 2 16.268V7.907a2.33 2.33 0 0 1 1.003-1.915l.128-.083z",
  },
] as const;

const submitIcon = {
  viewBox: "0 0 24 24",
  path: "M11.293 3.293a1 1 0 0 1 1.414 0l8 8a1 1 0 0 1-1.414 1.414L13 6.414V20a1 1 0 1 1-2 0V6.414l-6.293 6.293a1 1 0 0 1-1.414-1.414z",
};

export const HomePrompt = forwardRef<HomePromptHandle, HomePromptProps>(
  function HomePrompt(
    {
      onSubmit,
      disabled,
      attachments,
      onAddFiles,
      onRemoveAttachment,
      isUploading,
      readyAttachments,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      fill(text: string) {
        setValue(text);
        // Auto-resize after filling
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.style.height = "auto";
            ta.style.height = `${ta.scrollHeight}px`;
            ta.focus();
          }
        });
      },
    }));

    const hasContent =
      value.trim().length > 0 || (attachments && attachments.length > 0);

    const handleSubmit = useCallback(() => {
      const trimmed = value.trim();
      if (
        (!trimmed && (!attachments || attachments.length === 0)) ||
        disabled ||
        isUploading
      )
        return;
      onSubmit(
        trimmed,
        readyAttachments && readyAttachments.length > 0
          ? readyAttachments
          : undefined,
      );
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [value, disabled, isUploading, onSubmit, attachments, readyAttachments]);

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
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    return (
      <div className="overflow-hidden rounded-2xl border-[0.5px] border-[rgba(82,109,135,0.145)] bg-[#F7F7F7] shadow-[0_4px_8px_rgba(0,0,0,0.04)]">
        {attachments && onRemoveAttachment && (
          <ImageAttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
          />
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="让 Loomic 帮你设计..."
          disabled={disabled}
          rows={2}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed text-[#0E1014] placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-0.5">
            {onAddFiles ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      onAddFiles(Array.from(files));
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-[#C4C4C4] text-[#363636] transition-colors hover:bg-black/[0.04]"
                >
                  <svg
                    className="h-[14px] w-[14px]"
                    viewBox={toolbarButtons[0].viewBox}
                    fill="currentColor"
                    role="img"
                    aria-label="Attach"
                  >
                    <path d={toolbarButtons[0].path} />
                  </svg>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled
                title="Attach"
                className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border-[0.5px] border-[#C4C4C4] text-[#363636] opacity-30 transition-colors"
              >
                <svg
                  className="h-[14px] w-[14px]"
                  viewBox={toolbarButtons[0].viewBox}
                  fill="currentColor"
                  role="img"
                  aria-label="Attach"
                >
                  <path d={toolbarButtons[0].path} />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {toolbarButtons.slice(1).map((btn) => (
                <button
                  key={btn.name}
                  type="button"
                  disabled
                  title={btn.name}
                  className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border-[0.5px] border-[#C4C4C4] text-[#363636] opacity-30 transition-colors"
                >
                  <svg
                    className="h-[14px] w-[14px]"
                    viewBox={btn.viewBox}
                    fill="currentColor"
                    role="img"
                    aria-label={btn.name}
                  >
                    <path d={btn.path} />
                  </svg>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || isUploading || !hasContent}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                hasContent && !disabled && !isUploading
                  ? "bg-[#2F3640] text-white hover:bg-[#4A535F] active:bg-[#191E26]"
                  : "cursor-not-allowed bg-[#2F3640] text-white opacity-30"
              }`}
            >
              <svg
                className="h-[14px] w-[14px]"
                viewBox={submitIcon.viewBox}
                fill="currentColor"
                role="img"
                aria-label="Submit"
              >
                <path d={submitIcon.path} />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  },
);
