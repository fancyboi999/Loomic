"use client";

import { useCallback, useRef, useState } from "react";
import { uploadFile } from "../lib/server-api";

export type ImageAttachmentState = {
  id: string;
  file?: File;
  preview: string;
  uploading: boolean;
  error?: string;
  assetId?: string;
  url?: string;
  mimeType: string;
  source: "upload" | "canvas-ref";
};

export type CanvasImageRef = {
  assetId: string;
  url: string;
  mimeType: string;
  name?: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

let attachmentCounter = 0;

export function useImageAttachments(accessToken: string, projectId?: string) {
  const [attachments, setAttachments] = useState<ImageAttachmentState[]>([]);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const addFiles = useCallback(
    (files: File[]) => {
      const newAttachments: ImageAttachmentState[] = [];

      for (const file of files) {
        if (!ALLOWED_TYPES.has(file.type)) {
          continue;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const id = `att-${++attachmentCounter}`;
          newAttachments.push({
            id,
            file,
            preview: "",
            uploading: false,
            error: "File exceeds 10MB limit",
            mimeType: file.type,
            source: "upload",
          });
          continue;
        }

        const id = `att-${++attachmentCounter}`;
        const preview = URL.createObjectURL(file);
        newAttachments.push({
          id,
          file,
          preview,
          uploading: true,
          mimeType: file.type,
          source: "upload",
        });

        // Start upload
        uploadFile(accessTokenRef.current, file, projectId)
          .then((res) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? { ...a, uploading: false, assetId: res.asset.id, url: res.url }
                  : a,
              ),
            );
          })
          .catch((err) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? { ...a, uploading: false, error: err instanceof Error ? err.message : "Upload failed" }
                  : a,
              ),
            );
          });
      }

      if (newAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    },
    [projectId],
  );

  const addCanvasRef = useCallback((ref: CanvasImageRef) => {
    const id = `att-${++attachmentCounter}`;
    setAttachments((prev) => [
      ...prev,
      {
        id,
        preview: ref.url,
        uploading: false,
        assetId: ref.assetId,
        url: ref.url,
        mimeType: ref.mimeType,
        source: "canvas-ref",
      },
    ]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview && att.source === "upload") {
        URL.revokeObjectURL(att.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setAttachments((prev) => {
      for (const att of prev) {
        if (att.preview && att.source === "upload") {
          URL.revokeObjectURL(att.preview);
        }
      }
      return [];
    });
  }, []);

  const isUploading = attachments.some((a) => a.uploading);

  const readyAttachments = attachments
    .filter((a) => a.assetId && a.url && !a.error)
    .map((a) => ({
      assetId: a.assetId!,
      url: a.url!,
      mimeType: a.mimeType,
    }));

  return {
    attachments,
    addFiles,
    addCanvasRef,
    removeAttachment,
    clearAll,
    isUploading,
    readyAttachments,
  };
}
