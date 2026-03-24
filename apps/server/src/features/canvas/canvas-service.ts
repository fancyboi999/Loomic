import type { CanvasContent, CanvasDetail, Json } from "@loomic/shared";

import type { AuthenticatedUser, UserSupabaseClient } from "../../supabase/user.js";

export class CanvasServiceError extends Error {
  readonly statusCode: number;
  readonly code: "canvas_not_found" | "canvas_save_failed";

  constructor(
    code: "canvas_not_found" | "canvas_save_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CanvasService = {
  getCanvas(user: AuthenticatedUser, canvasId: string): Promise<CanvasDetail>;
  saveCanvasContent(
    user: AuthenticatedUser,
    canvasId: string,
    content: CanvasContent,
  ): Promise<void>;
};

/**
 * Marker prefix for files that have been extracted to Supabase Storage.
 * Format: `oss://bucket/objectPath`
 */
const OSS_MARKER_PREFIX = "oss://";
const CANVAS_FILES_BUCKET = "project-assets";

export function createCanvasService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): CanvasService {
  return {
    async getCanvas(user, canvasId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("canvases")
        .select("id, name, project_id, content")
        .eq("id", canvasId)
        .single();

      if (error || !data) {
        throw new CanvasServiceError("canvas_not_found", "Canvas not found.", 404);
      }

      const content = (data.content as CanvasContent) ?? { elements: [], appState: {} };

      // Resolve OSS-stored files back to base64 dataURLs for the frontend
      const resolvedContent = await resolveFilesFromStorage(client, content);

      return {
        id: data.id,
        name: data.name,
        projectId: data.project_id,
        content: resolvedContent,
      };
    },

    async saveCanvasContent(user, canvasId, content) {
      const client = options.createUserClient(user.accessToken);

      // Extract base64 files to Storage, replacing dataURLs with oss:// markers
      const leanContent = await extractFilesToStorage(client, canvasId, content);

      const { error } = await client
        .from("canvases")
        .update({ content: leanContent as unknown as Json })
        .eq("id", canvasId);

      if (error) {
        throw new CanvasServiceError("canvas_save_failed", "Unable to save canvas.", 500);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// File extraction (save path): base64 dataURL → Supabase Storage + oss:// marker
// ---------------------------------------------------------------------------

type CanvasFileRecord = Record<string, Record<string, unknown>>;

async function extractFilesToStorage(
  client: UserSupabaseClient,
  canvasId: string,
  content: CanvasContent,
): Promise<CanvasContent> {
  const files = (content as { files?: CanvasFileRecord }).files;
  if (!files || Object.keys(files).length === 0) {
    return content;
  }

  const updatedFiles: CanvasFileRecord = {};

  await Promise.all(
    Object.entries(files).map(async ([fileId, fileData]) => {
      const dataURL = fileData.dataURL as string | undefined;

      // Already extracted to storage — keep marker
      if (dataURL?.startsWith(OSS_MARKER_PREFIX)) {
        updatedFiles[fileId] = fileData;
        return;
      }

      // Only process base64 data URLs
      if (!dataURL?.startsWith("data:")) {
        updatedFiles[fileId] = fileData;
        return;
      }

      try {
        const { buffer, mimeType } = parseDataURL(dataURL);
        const ext = mimeToExt(mimeType);
        const objectPath = `canvas-files/${canvasId}/${fileId}.${ext}`;

        // Upsert: the same file ID may be re-saved
        const { error: uploadError } = await client.storage
          .from(CANVAS_FILES_BUCKET)
          .upload(objectPath, buffer, { contentType: mimeType, upsert: true });

        if (uploadError) {
          // On upload failure, keep the original base64 (graceful degradation)
          updatedFiles[fileId] = fileData;
          return;
        }

        updatedFiles[fileId] = {
          ...fileData,
          dataURL: `${OSS_MARKER_PREFIX}${CANVAS_FILES_BUCKET}/${objectPath}`,
        };
      } catch {
        // Unparseable dataURL — keep as-is
        updatedFiles[fileId] = fileData;
      }
    }),
  );

  return {
    ...content,
    files: updatedFiles,
  } as CanvasContent;
}

// ---------------------------------------------------------------------------
// File resolution (load path): oss:// marker → base64 dataURL
// ---------------------------------------------------------------------------

const SIGNED_URL_EXPIRY_SECONDS = 3600;

async function resolveFilesFromStorage(
  client: UserSupabaseClient,
  content: CanvasContent,
): Promise<CanvasContent> {
  const files = (content as { files?: CanvasFileRecord }).files;
  if (!files || Object.keys(files).length === 0) {
    return content;
  }

  // Separate OSS files from inline files
  const updatedFiles: CanvasFileRecord = {};
  const ossEntries: Array<{ fileId: string; fileData: Record<string, unknown>; bucket: string; objectPath: string }> = [];

  for (const [fileId, fileData] of Object.entries(files)) {
    const dataURL = fileData.dataURL as string | undefined;
    if (!dataURL?.startsWith(OSS_MARKER_PREFIX)) {
      updatedFiles[fileId] = fileData;
      continue;
    }

    const ref = dataURL.slice(OSS_MARKER_PREFIX.length);
    const slashIdx = ref.indexOf("/");
    if (slashIdx === -1) continue;
    ossEntries.push({
      fileId,
      fileData,
      bucket: ref.slice(0, slashIdx),
      objectPath: ref.slice(slashIdx + 1),
    });
  }

  if (ossEntries.length === 0) {
    return content;
  }

  // Batch-generate signed URLs instead of downloading each file
  // Group by bucket (normally all in one bucket)
  const byBucket = new Map<string, typeof ossEntries>();
  for (const entry of ossEntries) {
    const list = byBucket.get(entry.bucket) ?? [];
    list.push(entry);
    byBucket.set(entry.bucket, list);
  }

  for (const [bucket, entries] of byBucket) {
    const paths = entries.map((e) => e.objectPath);
    const { data } = await client.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

    if (data) {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const signedEntry = data[i];
        if (signedEntry?.signedUrl) {
          // Return storageUrl instead of dataURL — frontend resolves lazily
          updatedFiles[entry.fileId] = {
            ...entry.fileData,
            dataURL: undefined,
            storageUrl: signedEntry.signedUrl,
          };
        }
        // If signing failed, drop the file (same as before)
      }
    }
  }

  return {
    ...content,
    files: updatedFiles,
  } as CanvasContent;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function parseDataURL(dataURL: string): { buffer: Buffer; mimeType: string } {
  // Format: data:[<mediatype>][;base64],<data>
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return {
    mimeType: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/svg+xml": return "svg";
    case "image/gif": return "gif";
    default: return "bin";
  }
}
