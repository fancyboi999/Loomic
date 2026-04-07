"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  name?: string;
};

export type CanvasImageRef = {
  assetId: string;
  url: string;
  mimeType: string;
  name?: string;
};

/** A fully-uploaded attachment ready to be sent, including its origin source. */
export type ReadyAttachment = {
  assetId: string;
  url: string;
  mimeType: string;
  source: "upload" | "canvas-ref";
  name?: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function useImageAttachments(accessToken: string, projectId?: string) {
  const [attachments, setAttachments] = useState<ImageAttachmentState[]>([]);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  // Use a ref mirror of attachments for retryUpload to avoid stale closures.
  // Without this, retryUpload would capture a snapshot of `attachments` at
  // the time it was called, potentially missing concurrent state updates.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // Clean up all object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      for (const att of attachmentsRef.current) {
        if (att.preview && att.source === "upload") {
          URL.revokeObjectURL(att.preview);
        }
      }
    };
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const newAttachments: ImageAttachmentState[] = [];

      for (const file of files) {
        if (!ALLOWED_TYPES.has(file.type)) {
          console.warn("[image-attachments] Rejected file type:", file.type);
          continue;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          const id = crypto.randomUUID();
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

        const id = crypto.randomUUID();
        const preview = URL.createObjectURL(file);
        newAttachments.push({
          id,
          file,
          preview,
          uploading: true,
          mimeType: file.type,
          source: "upload",
          name: file.name,
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
            console.warn("[image-attachments] Upload failed:", err);
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
    const id = crypto.randomUUID();
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
        ...(ref.name ? { name: ref.name } : {}),
      },
    ]);
  }, []);

  const retryUpload = useCallback(
    (id: string) => {
      // Read from ref to get the latest attachments state, avoiding stale closure
      const att = attachmentsRef.current.find((a) => a.id === id);
      if (!att?.file) return;

      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? (() => {
                const { error: _error, ...rest } = a;
                return { ...rest, uploading: true };
              })()
            : a,
        ),
      );

      uploadFile(accessTokenRef.current, att.file, projectId)
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
          console.warn("[image-attachments] Retry upload failed:", err);
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, uploading: false, error: err instanceof Error ? err.message : "Upload failed" }
                : a,
            ),
          );
        });
    },
    [projectId],
  );

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
      source: a.source,
      ...(a.name ? { name: a.name } : {}),
    }));

  return {
    attachments,
    addFiles,
    addCanvasRef,
    retryUpload,
    removeAttachment,
    clearAll,
    isUploading,
    readyAttachments,
  };
}
