"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ImageGenerationPreference, VideoGenerationPreference } from "@loomic/shared";

import type { ImageAttachmentState, ReadyAttachment } from "../hooks/use-image-attachments";
import type { HomeExampleSelection } from "@/lib/home-example-seeds";
import { AgentModelSelector } from "./agent-model-selector";
import { ImageAttachmentBar } from "./image-attachment-bar";
import { ImageModelPreferencePopover } from "./image-model-preference";
import { useAgentModel } from "../hooks/use-agent-model";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
import { useVideoModelPreference } from "../hooks/use-video-model-preference";

export type HomePromptHandle = {
  /** Programmatically set the textarea value (e.g. from an example pill). */
  fill: (text: string) => void;
};

type HomePromptProps = {
  onSubmit: (
    prompt: string,
    attachments?: ReadyAttachment[],
    imageGenerationPreference?: ImageGenerationPreference,
    videoGenerationPreference?: VideoGenerationPreference,
    model?: string,
  ) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  readyAttachments?: ReadyAttachment[];
  selectedSeed?: HomeExampleSelection | null;
  onClearSelectedSeed?: () => void;
};

const toolbarButtons = [
  {
    name: "Attach",
    viewBox: "0 0 24 24",
    path: "M16 1.1A4.9 4.9 0 0 1 20.9 6a4.9 4.9 0 0 1-1.429 3.457h.001l-8.414 8.587-.007.006a2.9 2.9 0 0 1-3.887.193l-.213-.192a2.9 2.9 0 0 1-.007-4.095l8.414-8.586a.9.9 0 0 1 1.286 1.26L8.23 15.216l-.007.006a1.1 1.1 0 0 0 1.556 1.555l8.407-8.579.007-.007a3.1 3.1 0 0 0 .105-4.271l-.105-.112a3.1 3.1 0 0 0-4.384 0L5.4 12.387l-.007.006a5.1 5.1 0 0 0 7.214 7.213l7.749-7.934a.9.9 0 0 1 1.288 1.256l-7.753 7.938q-.005.007-.012.014a6.9 6.9 0 0 1-9.758-9.76l8.408-8.578.007-.007A4.9 4.9 0 0 1 16 1.1",
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
      selectedSeed,
      onClearSelectedSeed,
    },
    ref,
  ) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
    const agentBtnRef = useRef<HTMLButtonElement>(null);
    const { preference } = useImageModelPreference();
    const { preference: videoPreference } = useVideoModelPreference();
    const { model: agentModel } = useAgentModel();

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
        (!trimmed && (!attachments || attachments.length === 0) && !selectedSeed) ||
        disabled ||
        isUploading
      )
        return;

      // Merge user-uploaded attachments with example seed images
      let mergedAttachments: ReadyAttachment[] | undefined =
        readyAttachments && readyAttachments.length > 0
          ? [...readyAttachments]
          : undefined;

      const seedImageMentions =
        selectedSeed?.inputMentions?.filter((m) => m.type === "image") ?? [];
      if (seedImageMentions.length > 0) {
        const seedAttachments: ReadyAttachment[] = seedImageMentions.map(
          (mention, i) => ({
            assetId: `seed-${selectedSeed!.categoryKey}-${i}`,
            url: mention.imgSrc,
            mimeType: "image/webp",
            source: "upload" as const,
            name: mention.name,
          }),
        );
        mergedAttachments = mergedAttachments
          ? [...mergedAttachments, ...seedAttachments]
          : seedAttachments;
      }

      onSubmit(
        trimmed,
        mergedAttachments,
        preference.mode === "manual" && preference.models.length > 0
          ? preference
          : undefined,
        videoPreference.mode === "manual" && videoPreference.models.length > 0
          ? videoPreference
          : undefined,
        agentModel ?? undefined,
      );
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [value, disabled, isUploading, onSubmit, attachments, readyAttachments, preference, videoPreference, agentModel, selectedSeed]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      },
      [handleSubmit],
    );

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

    const handleInput = useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

    return (
      <div className="overflow-hidden rounded-2xl border-[0.5px] border-border bg-muted shadow-[0_4px_8px_rgba(0,0,0,0.04)]">
        {attachments && onRemoveAttachment && (
          <ImageAttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
          />
        )}
        {selectedSeed ? (
          <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  {selectedSeed.categoryLabel}
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {selectedSeed.title}
                </p>
              </div>

              {onClearSelectedSeed ? (
                <button
                  type="button"
                  onClick={onClearSelectedSeed}
                  className="shrink-0 rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  清除
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {selectedSeed.inputMentions
                .filter((mention) => mention.type === "image")
                .map((mention) => (
                  <div
                    key={`${selectedSeed.title}-${mention.imgSrc}`}
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
                  >
                    <img
                      src={mention.imgSrc}
                      alt={mention.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onInput={handleInput}
          placeholder="让 Loomic 帮你设计..."
          disabled={disabled}
          rows={2}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
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
                  className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-border text-foreground transition-colors hover:bg-muted"
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
                className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border-[0.5px] border-border text-foreground opacity-30 transition-colors"
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
            <AgentModelSelector />
            <div className="flex items-center gap-0.5">
              {toolbarButtons.slice(1).map((btn) => {
                if (btn.name === "Agent") {
                  return (
                    <div key={btn.name} className="relative">
                      <button
                        ref={agentBtnRef}
                        type="button"
                        onClick={() => setModelPopoverOpen((prev) => !prev)}
                        title={btn.name}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] transition-colors ${
                          preference.mode === "manual"
                            ? "border-accent bg-accent/30 text-accent-foreground"
                            : "border-border text-foreground hover:bg-muted"
                        }`}
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
                      <ImageModelPreferencePopover
                        open={modelPopoverOpen}
                        onClose={() => setModelPopoverOpen(false)}
                        anchorRef={agentBtnRef}
                      />
                    </div>
                  );
                }
                return (
                  <button
                    key={btn.name}
                    type="button"
                    disabled
                    title={btn.name}
                    className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border-[0.5px] border-border text-foreground opacity-30 transition-colors"
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
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || isUploading || !hasContent}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                hasContent && !disabled && !isUploading
                  ? "bg-primary text-primary-foreground hover:bg-primary/80 hover:accent-glow active:bg-primary/90"
                  : "cursor-not-allowed bg-primary text-primary-foreground opacity-30"
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
