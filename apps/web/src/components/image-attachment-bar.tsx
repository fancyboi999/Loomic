"use client";

import type { ImageAttachmentState } from "../hooks/use-image-attachments";

type ImageAttachmentBarProps = {
  attachments: ImageAttachmentState[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
};

export function ImageAttachmentBar({ attachments, onRemove, onRetry }: ImageAttachmentBarProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-2 py-1.5">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E3E3E3] bg-[#F7F7F7]"
        >
          {att.preview ? (
            <img
              src={att.preview}
              alt="Attachment"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg className="h-5 w-5 text-[#A4A9B2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
          )}

          {/* Upload spinner overlay */}
          {att.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          )}

          {/* Error overlay with retry */}
          {att.error && (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-red-500/20 ${onRetry && att.file ? "cursor-pointer" : ""}`}
              onClick={onRetry && att.file ? () => onRetry(att.id) : undefined}
              title={att.error}
            >
              <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 0 1 1 1v2.101a7.002 7.002 0 0 1 11.601 2.566 1 1 0 1 1-1.885.666A5.002 5.002 0 0 0 5.999 7H9a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm.008 9.057a1 1 0 0 1 1.276.61A5.002 5.002 0 0 0 14.001 13H11a1 1 0 1 1 0-2h5a1 1 0 0 1 1 1v5a1 1 0 1 1-2 0v-2.101a7.002 7.002 0 0 1-11.601-2.566 1 1 0 0 1 .61-1.276Z" clipRule="evenodd" />
              </svg>
              {onRetry && att.file && (
                <span className="text-[9px] font-medium text-red-600">Retry</span>
              )}
            </div>
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[#2F3640] text-white group-hover:flex"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
