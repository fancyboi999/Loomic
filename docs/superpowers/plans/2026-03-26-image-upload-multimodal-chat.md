# Image Upload & Multimodal Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable image upload in Home page, Chat sidebar, and Canvas chatbar (`@` canvas image reference) so users can send images alongside text to the AI model.

**Architecture:** Extend the shared `ContentBlock` union with `ImageBlock`, migrate `project-assets` bucket to public (replacing all signed URLs with public URLs), modify the agent runtime to construct multimodal LangChain messages, and build frontend components (hook + attachment bar + canvas image picker) integrated into existing input surfaces.

**Tech Stack:** TypeScript, Zod, React hooks, Supabase Storage (public bucket), LangChain multimodal ContentBlock, Fastify

---

### Task 1: Extend Shared Types — ImageBlock, ImageAttachment, ContentBlock

**Files:**
- Modify: `packages/shared/src/contracts.ts:125-144` (add imageBlockSchema, extend contentBlockSchema)
- Modify: `packages/shared/src/contracts.ts:28-33` (add imageAttachmentSchema, extend runCreateRequestSchema)
- Modify: `packages/shared/src/http.ts:160-170` (rename signedUrl → url in upload response)
- Modify: `packages/shared/src/contracts.test.ts` (update tests)

- [ ] **Step 1: Add imageBlockSchema and imageAttachmentSchema**

In `packages/shared/src/contracts.ts`, after `toolBlockSchema` (line 139), add:

```ts
export const imageBlockSchema = z.object({
  type: z.literal("image"),
  assetId: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().min(1),
  source: z.enum(["upload", "canvas-ref"]),
});
```

- [ ] **Step 2: Extend contentBlockSchema**

Change `contentBlockSchema` (lines 141-144) from:

```ts
export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  toolBlockSchema,
]);
```

to:

```ts
export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  toolBlockSchema,
  imageBlockSchema,
]);
```

- [ ] **Step 3: Add ImageBlock type export**

After the existing type exports (around line 140), add:

```ts
export type ImageBlock = z.infer<typeof imageBlockSchema>;
```

- [ ] **Step 4: Add imageAttachmentSchema and extend runCreateRequestSchema**

After `imageBlockSchema`, add:

```ts
export const imageAttachmentSchema = z.object({
  assetId: z.string().min(1),
  url: z.string().url(),
  mimeType: z.string().min(1),
});
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
```

Change `runCreateRequestSchema` (lines 28-33) from:

```ts
export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string().min(1),
  canvasId: canvasIdSchema.optional(),
});
```

to:

```ts
export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string().min(1),
  canvasId: canvasIdSchema.optional(),
  attachments: z.array(imageAttachmentSchema).optional(),
});
```

- [ ] **Step 5: Update upload response to use `url` instead of `signedUrl`**

In `packages/shared/src/http.ts`, change `uploadResponseSchema` (lines 160-163):

From:

```ts
export const uploadResponseSchema = z.object({
  asset: assetObjectSchema,
  signedUrl: z.string().min(1),
});
```

To:

```ts
export const uploadResponseSchema = z.object({
  asset: assetObjectSchema,
  url: z.string().min(1),
});
```

Also update `assetSignedUrlResponseSchema` (lines 165-167):

From:

```ts
export const assetSignedUrlResponseSchema = z.object({
  signedUrl: z.string().min(1),
});
```

To:

```ts
export const assetSignedUrlResponseSchema = z.object({
  url: z.string().min(1),
});
```

Update the corresponding type exports — `UploadResponse` and `AssetSignedUrlResponse` will update automatically via `z.infer`.

- [ ] **Step 6: Update contracts.test.ts**

Add a test for `runCreateRequestSchema` with attachments:

```ts
it("accepts optional attachments in run creation", () => {
  const result = runCreateRequestSchema.parse({
    sessionId: "session-1",
    conversationId: "conv-1",
    prompt: "Analyze this image",
    attachments: [
      {
        assetId: "asset-123",
        url: "https://example.com/image.png",
        mimeType: "image/png",
      },
    ],
  });
  expect(result.attachments).toHaveLength(1);
  expect(result.attachments![0].assetId).toBe("asset-123");
});
```

- [ ] **Step 7: Run tests**

Run: `cd packages/shared && pnpm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/contracts.ts packages/shared/src/contracts.test.ts packages/shared/src/http.ts
git commit -m "feat: add ImageBlock, ImageAttachment types and extend RunCreateRequest for multimodal chat"
```

---

### Task 2: Supabase Migration — project-assets Bucket to Public

**Files:**
- Create: `apps/server/supabase/migrations/<timestamp>_public_project_assets_bucket.sql`

- [ ] **Step 1: Create migration file**

Create migration SQL (use `YYYYMMDDHHmmss` format for filename):

```sql
-- Make project-assets bucket publicly accessible.
-- This enables permanent public URLs (no signed URL expiry),
-- which is required for multimodal AI chat and future sharing features.
UPDATE storage.buckets SET public = true WHERE id = 'project-assets';
```

- [ ] **Step 2: Push migration to Supabase**

Run: `cd apps/server && npx supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add apps/server/supabase/migrations/
git commit -m "feat: make project-assets storage bucket public for permanent URLs"
```

---

### Task 3: Upload Service — Signed URL to Public URL

**Files:**
- Modify: `apps/server/src/features/uploads/upload-service.ts`

- [ ] **Step 1: Add getPublicUrl helper and PUBLIC_BUCKETS constant**

In `upload-service.ts`, after the imports (line 6), add:

```ts
/** Buckets configured as public in Supabase — use getPublicUrl instead of signed URLs */
const PUBLIC_BUCKETS = new Set(["project-assets"]);
```

After `buildObjectPath` function (line 192), replace the existing `createSignedUrl` function (lines 194-212) with:

```ts
function getAssetUrl(
  client: UserSupabaseClient,
  bucket: string,
  objectPath: string,
): string | Promise<string> {
  if (PUBLIC_BUCKETS.has(bucket)) {
    const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl;
  }
  // Fallback for private buckets (e.g. user-avatars)
  return createSignedUrl(client, bucket, objectPath);
}

async function createSignedUrl(
  client: UserSupabaseClient,
  bucket: string,
  objectPath: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw new UploadServiceError(
      "upload_failed",
      "Failed to generate signed URL.",
      500,
    );
  }

  return data.signedUrl;
}
```

- [ ] **Step 2: Update UploadService type and uploadFile method**

Change the `UploadService` type (lines 32-47). Rename `signedUrl` to `url`:

```ts
export type UploadService = {
  uploadFile(
    user: AuthenticatedUser,
    input: UploadFileInput,
  ): Promise<{ asset: AssetObject; url: string }>;

  getAssetUrl(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<string>;

  deleteAsset(
    user: AuthenticatedUser,
    assetId: string,
  ): Promise<void>;
};
```

In the `uploadFile` method, change line 103 from:

```ts
const signedUrl = await createSignedUrl(client, input.bucket, objectPath);
```

to:

```ts
const url = await getAssetUrl(client, input.bucket, objectPath);
```

And change the return (lines 105-117) to use `url` instead of `signedUrl`:

```ts
return {
  asset: {
    id: assetRow.id,
    bucket: assetRow.bucket as AssetBucket,
    objectPath: assetRow.object_path,
    mimeType: assetRow.mime_type,
    byteSize: assetRow.byte_size,
    workspaceId: assetRow.workspace_id,
    projectId: assetRow.project_id,
    createdAt: assetRow.created_at,
  },
  url,
};
```

- [ ] **Step 3: Update getSignedUrl method to getAssetUrl**

Rename the method from `getSignedUrl` to `getAssetUrl` (line 120):

```ts
async getAssetUrl(user, assetId) {
  const client = options.createUserClient(user.accessToken);

  const { data: assetRow, error } = await client
    .from("asset_objects")
    .select("bucket, object_path")
    .eq("id", assetId)
    .single();

  if (error || !assetRow) {
    throw new UploadServiceError(
      "asset_not_found",
      "Asset not found.",
      404,
    );
  }

  return getAssetUrl(client, assetRow.bucket, assetRow.object_path);
},
```

- [ ] **Step 4: Update uploads HTTP route to match new interface**

In `apps/server/src/http/uploads.ts`, update the GET handler (lines 95-114) to use `getAssetUrl` and return `{ url }`:

Change:
```ts
const signedUrl = await options.uploadService.getSignedUrl(
  user,
  request.params.assetId,
);

return reply
  .code(200)
  .send(assetSignedUrlResponseSchema.parse({ signedUrl }));
```

To:
```ts
const url = await options.uploadService.getAssetUrl(
  user,
  request.params.assetId,
);

return reply
  .code(200)
  .send(assetSignedUrlResponseSchema.parse({ url }));
```

Also update the POST handler return (line 88) — `result` now has `url` instead of `signedUrl`, and `uploadResponseSchema` expects `url`, so no code change needed there (it passes through).

- [ ] **Step 5: Update frontend server-api.ts references**

In `apps/web/src/lib/server-api.ts`, the `UploadResponse` and `AssetSignedUrlResponse` types auto-update from shared package. Check for any direct `signedUrl` property access in the frontend and update to `url`.

Search for `.signedUrl` in the web app and update all references.

- [ ] **Step 6: Run tests**

Run: `cd apps/server && pnpm test`
Expected: Existing tests pass (update any that reference `signedUrl` to `url`)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/features/uploads/upload-service.ts apps/server/src/http/uploads.ts apps/web/src/lib/server-api.ts packages/shared/src/http.ts
git commit -m "feat: migrate upload service from signed URLs to public URLs for project-assets bucket"
```

---

### Task 4: Server-wide Signed URL → Public URL Migration

**Files:**
- Modify: `apps/server/src/agent/runtime.ts:323-328`
- Modify: `apps/server/src/features/jobs/executors/image-generation.ts:93-100`
- Modify: `apps/server/src/features/canvas/canvas-service.ts:191-221`
- Modify: `apps/server/src/features/projects/project-service.ts:322-326, 508-510`

- [ ] **Step 1: Update runtime.ts — image generation URL**

In `apps/server/src/agent/runtime.ts`, change lines 323-328 from:

```ts
const { data: urlData, error: urlError } = await client.storage
  .from("project-assets")
  .createSignedUrl(objectPath, 3600);
if (urlError || !urlData?.signedUrl) throw new Error("Signed URL failed");

return urlData.signedUrl;
```

to:

```ts
const { data: urlData } = client.storage
  .from("project-assets")
  .getPublicUrl(objectPath);

return urlData.publicUrl;
```

Note: `getPublicUrl` is synchronous, no `await`, no error possible.

- [ ] **Step 2: Update image-generation.ts executor**

In `apps/server/src/features/jobs/executors/image-generation.ts`, change lines 93-100 from:

```ts
// Generate a short-lived signed URL (1 hour) for the result consumer
const { data: urlData } = await admin.storage
  .from("project-assets")
  .createSignedUrl(objectPath, 3600);

return {
  asset_id: (assetRow as { id: string }).id,
  signed_url: urlData?.signedUrl ?? null,
```

to:

```ts
const { data: urlData } = admin.storage
  .from("project-assets")
  .getPublicUrl(objectPath);

return {
  asset_id: (assetRow as { id: string }).id,
  signed_url: urlData.publicUrl,
```

Note: Keep `signed_url` key name for backward compatibility with stream adapter and other consumers — the value is now a public URL but renaming the field would require cascading changes in stream-adapter.ts and other files.

- [ ] **Step 3: Update canvas-service.ts — resolveFilesFromStorage**

In `apps/server/src/features/canvas/canvas-service.ts`, change the batch signing loop (lines 200-221) from:

```ts
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
```

to:

```ts
for (const [bucket, entries] of byBucket) {
  for (const entry of entries) {
    const { data } = client.storage
      .from(bucket)
      .getPublicUrl(entry.objectPath);
    updatedFiles[entry.fileId] = {
      ...entry.fileData,
      dataURL: undefined,
      storageUrl: data.publicUrl,
    };
  }
}
```

Note: `getPublicUrl` is per-path (no batch version), but it's pure string concatenation — no network call, so looping is fine and actually simpler.

- [ ] **Step 4: Update project-service.ts — saveThumbnail**

In `apps/server/src/features/projects/project-service.ts`, change lines 322-326 from:

```ts
const { data: urlData } = await client.storage
  .from(THUMBNAIL_BUCKET)
  .createSignedUrl(objectPath, THUMBNAIL_URL_EXPIRY_SECONDS);

return { thumbnailUrl: urlData?.signedUrl ?? "" };
```

to:

```ts
const { data: urlData } = client.storage
  .from(THUMBNAIL_BUCKET)
  .getPublicUrl(objectPath);

return { thumbnailUrl: urlData.publicUrl };
```

- [ ] **Step 5: Update project-service.ts — generateThumbnailUrls**

In `apps/server/src/features/projects/project-service.ts`, change the `generateThumbnailUrls` function (lines 495-524) from:

```ts
async function generateThumbnailUrls(
  client: UserSupabaseClient,
  projects: Array<{ id: string; thumbnail_path: string | null }>,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  if (projects.length === 0) return urlMap;

  const pathToProjectId = new Map(
    projects
      .filter((p): p is typeof p & { thumbnail_path: string } => !!p.thumbnail_path)
      .map((p) => [p.thumbnail_path, p.id]),
  );

  const paths = [...pathToProjectId.keys()];

  const { data } = await client.storage
    .from(THUMBNAIL_BUCKET)
    .createSignedUrls(paths, THUMBNAIL_URL_EXPIRY_SECONDS);

  if (data) {
    for (const entry of data) {
      if (entry.signedUrl && entry.path) {
        const projectId = pathToProjectId.get(entry.path);
        if (projectId) {
          urlMap.set(projectId, entry.signedUrl);
        }
      }
    }
  }

  return urlMap;
}
```

to:

```ts
function generateThumbnailUrls(
  client: UserSupabaseClient,
  projects: Array<{ id: string; thumbnail_path: string | null }>,
): Map<string, string> {
  const urlMap = new Map<string, string>();
  if (projects.length === 0) return urlMap;

  for (const project of projects) {
    if (!project.thumbnail_path) continue;
    const { data } = client.storage
      .from(THUMBNAIL_BUCKET)
      .getPublicUrl(project.thumbnail_path);
    urlMap.set(project.id, data.publicUrl);
  }

  return urlMap;
}
```

Note: Function is no longer async — update callers to remove `await` if needed.

- [ ] **Step 6: Remove unused SIGNED_URL_EXPIRY_SECONDS and THUMBNAIL_URL_EXPIRY_SECONDS**

In `canvas-service.ts`, remove `SIGNED_URL_EXPIRY_SECONDS` import/constant if no longer used.
In `project-service.ts`, remove `THUMBNAIL_URL_EXPIRY_SECONDS` constant if no longer used.

- [ ] **Step 7: Run tests**

Run: `cd apps/server && pnpm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/agent/runtime.ts apps/server/src/features/jobs/executors/image-generation.ts apps/server/src/features/canvas/canvas-service.ts apps/server/src/features/projects/project-service.ts
git commit -m "feat: migrate all project-assets signed URLs to public URLs"
```

---

### Task 5: Agent Runtime — Multimodal Message Construction

**Files:**
- Modify: `apps/server/src/agent/runtime.ts:33-42, 376-384`

- [ ] **Step 1: Update RuntimeRunRecord to include attachments**

In `apps/server/src/agent/runtime.ts`, `RuntimeRunRecord` (line 33) extends `RunCreateRequest` which now includes optional `attachments`. No change needed here — it inherits automatically.

Verify: `RuntimeRunRecord` uses spread `...input` in `createRun` (line 101-102), so `attachments` from the input will be stored on the run record.

- [ ] **Step 2: Update message construction in streamRun**

In `apps/server/src/agent/runtime.ts`, change the message construction (lines 376-384) from:

```ts
stream = agent.streamEvents(
  {
    messages: [
      {
        content: run.prompt,
        role: "user",
      },
    ],
  },
```

to:

```ts
const hasAttachments = run.attachments && run.attachments.length > 0;
const messageContent = hasAttachments
  ? [
      { type: "text" as const, text: run.prompt },
      ...run.attachments!.map((a) => ({
        type: "image" as const,
        url: a.url,
        mimeType: a.mimeType,
      })),
    ]
  : run.prompt;

stream = agent.streamEvents(
  {
    messages: [
      {
        content: messageContent,
        role: "user",
      },
    ],
  },
```

- [ ] **Step 3: Run tests**

Run: `cd apps/server && pnpm test`
Expected: All tests pass. Existing stream-adapter tests should still pass since they mock the agent and don't test message construction internals.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/agent/runtime.ts
git commit -m "feat: construct multimodal LangChain messages with image attachments"
```

---

### Task 6: Frontend Hook — useImageAttachments

**Files:**
- Create: `apps/web/src/hooks/use-image-attachments.ts`

- [ ] **Step 1: Create the hook**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-image-attachments.ts
git commit -m "feat: add useImageAttachments hook for managing image uploads"
```

---

### Task 7: Frontend Component — ImageAttachmentBar

**Files:**
- Create: `apps/web/src/components/image-attachment-bar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import type { ImageAttachmentState } from "../hooks/use-image-attachments";

type ImageAttachmentBarProps = {
  attachments: ImageAttachmentState[];
  onRemove: (id: string) => void;
};

export function ImageAttachmentBar({ attachments, onRemove }: ImageAttachmentBarProps) {
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

          {/* Error overlay */}
          {att.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 0-2 0v4a1 1 0 0 0 2 0V6Zm-1 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/image-attachment-bar.tsx
git commit -m "feat: add ImageAttachmentBar component for thumbnail preview"
```

---

### Task 8: ChatMessage — Render ImageBlock in User Messages

**Files:**
- Modify: `apps/web/src/components/chat-message.tsx:29-43`

- [ ] **Step 1: Update user message rendering to show images**

In `apps/web/src/components/chat-message.tsx`, change the user message branch (lines 29-43) from:

```tsx
if (isUser) {
  const text = contentBlocks[0]?.type === "text" ? contentBlocks[0].text : "";
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full justify-end pl-10"
    >
      <div className="inline-block rounded-xl bg-[#F7F7F7] px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#363636]">
        {text}
      </div>
    </motion.div>
  );
}
```

to:

```tsx
if (isUser) {
  const textBlocks = contentBlocks.filter((b) => b.type === "text");
  const imageBlocks = contentBlocks.filter((b) => b.type === "image");
  const text = textBlocks.map((b) => (b as { text: string }).text).join("");

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex w-full flex-col items-end gap-2 pl-10"
    >
      {imageBlocks.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {imageBlocks.map((block, idx) => (
            <img
              key={idx}
              src={(block as { url: string }).url}
              alt="Attached image"
              className="h-20 w-20 rounded-lg border border-[#E3E3E3] object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}
      {text && (
        <div className="inline-block rounded-xl bg-[#F7F7F7] px-3 py-2.5 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#363636]">
          {text}
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/chat-message.tsx
git commit -m "feat: render image attachments in user message bubbles"
```

---

### Task 9: ChatInput — Add Attach Button and Attachment Bar

**Files:**
- Modify: `apps/web/src/components/chat-input.tsx`

- [ ] **Step 1: Extend ChatInputProps and add file input**

Rewrite `apps/web/src/components/chat-input.tsx` to support attachments:

```tsx
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
  isUploading?: boolean;
  onAtTrigger?: () => void;
};

export function ChatInput({
  onSend,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
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
      setValue(newValue);
      // Detect @ trigger
      if (onAtTrigger && newValue.endsWith("@")) {
        onAtTrigger();
      }
    },
    [onAtTrigger],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && onAddFiles) {
        onAddFiles(Array.from(files));
      }
      // Reset input so the same file can be selected again
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/chat-input.tsx
git commit -m "feat: add file attach button, drag-drop, and attachment bar to ChatInput"
```

---

### Task 10: ChatSidebar — Wire Attachments into Send Flow

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx`

- [ ] **Step 1: Import and initialize useImageAttachments**

In `apps/web/src/components/chat-sidebar.tsx`, add import:

```ts
import { useImageAttachments } from "../hooks/use-image-attachments";
import type { ImageBlock } from "@loomic/shared";
```

Inside the `ChatSidebar` component, after the existing state declarations (around line 96), add:

```ts
const {
  attachments: imageAttachments,
  addFiles,
  addCanvasRef,
  removeAttachment,
  clearAll: clearAttachments,
  isUploading,
  readyAttachments,
} = useImageAttachments(accessToken);
```

- [ ] **Step 2: Update handleSend to include attachments**

Modify `handleSend` (line 359) to accept attachments. Change the signature and body:

Change from:
```ts
const handleSend = useCallback(
  async (text: string) => {
```

to:
```ts
const handleSend = useCallback(
  async (text: string) => {
    const currentAttachments = readyAttachments;
```

Change the user message construction (lines 367-371) from:

```ts
const userMsg: Message = {
  id: `user-${Date.now()}`,
  role: "user",
  contentBlocks: [{ type: "text", text }],
};
```

to:

```ts
const imageBlocks: ContentBlock[] = currentAttachments.map((a) => ({
  type: "image" as const,
  assetId: a.assetId,
  url: a.url,
  mimeType: a.mimeType,
  source: "upload" as const,
}));
const userMsg: Message = {
  id: `user-${Date.now()}`,
  role: "user",
  contentBlocks: [
    { type: "text", text },
    ...imageBlocks,
  ],
};
```

Change the saveMessage call (lines 375-379) from:

```ts
saveMessage(accessTokenRef.current, currentSessionId, {
  role: "user",
  content: text,
  contentBlocks: [{ type: "text", text }],
}).catch((err) => console.error("[chat] Failed to save user message:", err));
```

to:

```ts
saveMessage(accessTokenRef.current, currentSessionId, {
  role: "user",
  content: text,
  contentBlocks: [
    { type: "text", text },
    ...imageBlocks,
  ],
}).catch((err) => console.error("[chat] Failed to save user message:", err));
```

Change the createRun call (lines 406-416) from:

```ts
const run = await createRun(
  {
    sessionId: currentSessionId,
    conversationId: canvasId,
    prompt: text,
    canvasId,
  },
  {
    accessToken: accessTokenRef.current,
  },
);
```

to:

```ts
const run = await createRun(
  {
    sessionId: currentSessionId,
    conversationId: canvasId,
    prompt: text,
    canvasId,
    ...(currentAttachments.length > 0 ? { attachments: currentAttachments } : {}),
  },
  {
    accessToken: accessTokenRef.current,
  },
);
```

After the createRun call, clear attachments:

```ts
clearAttachments();
```

Add `readyAttachments` and `clearAttachments` to the dependency array of `handleSend`.

- [ ] **Step 3: Pass attachment props to ChatInput**

Find where `<ChatInput>` is rendered in the JSX and change from:

```tsx
<ChatInput onSend={handleSend} disabled={streaming} />
```

to:

```tsx
<ChatInput
  onSend={handleSend}
  disabled={streaming}
  attachments={imageAttachments}
  onAddFiles={addFiles}
  onRemoveAttachment={removeAttachment}
  isUploading={isUploading}
/>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx
git commit -m "feat: wire image attachments into ChatSidebar send flow"
```

---

### Task 11: HomePrompt — Enable Attach Button

**Files:**
- Modify: `apps/web/src/components/home-prompt.tsx`
- Modify: `apps/web/src/app/(workspace)/home/page.tsx` (pass accessToken and attachment props)

- [ ] **Step 1: Extend HomePromptProps**

In `apps/web/src/components/home-prompt.tsx`, update imports and types:

```ts
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { ImageAttachmentState } from "../hooks/use-image-attachments";
import type { ImageAttachment } from "@loomic/shared";
import { ImageAttachmentBar } from "./image-attachment-bar";
```

Change `HomePromptProps` (lines 16-19):

```ts
type HomePromptProps = {
  onSubmit: (prompt: string, attachments?: ImageAttachment[]) => void;
  disabled?: boolean;
  attachments?: ImageAttachmentState[];
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  readyAttachments?: ImageAttachment[];
};
```

- [ ] **Step 2: Update the component to use new props**

Destructure new props and add file input:

```ts
function HomePrompt(
  { onSubmit, disabled, attachments, onAddFiles, onRemoveAttachment, isUploading, readyAttachments },
  ref,
) {
```

Add a `fileInputRef`:

```ts
const fileInputRef = useRef<HTMLInputElement>(null);
```

Update `handleSubmit` to pass attachments:

```ts
const handleSubmit = useCallback(() => {
  const trimmed = value.trim();
  if ((!trimmed && (!attachments || attachments.length === 0)) || disabled || isUploading) return;
  onSubmit(trimmed, readyAttachments && readyAttachments.length > 0 ? readyAttachments : undefined);
  setValue("");
  if (textareaRef.current) {
    textareaRef.current.style.height = "auto";
  }
}, [value, disabled, isUploading, onSubmit, attachments, readyAttachments]);
```

- [ ] **Step 3: Update the Attach button JSX**

Replace the disabled Attach button (lines 119-134) with a functional one:

```tsx
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
```

- [ ] **Step 4: Add attachment bar above textarea**

Insert `ImageAttachmentBar` between the opening `<div>` and the `<textarea>`:

```tsx
<div className="overflow-hidden rounded-2xl border-[0.5px] border-[rgba(82,109,135,0.145)] bg-[#F7F7F7] shadow-[0_4px_8px_rgba(0,0,0,0.04)]">
  {attachments && onRemoveAttachment && (
    <ImageAttachmentBar attachments={attachments} onRemove={onRemoveAttachment} />
  )}
  <textarea ...
```

- [ ] **Step 5: Update submit button disabled state**

Change the submit button `disabled` prop to account for uploading:

```tsx
disabled={disabled || isUploading || (!hasContent && (!attachments || attachments.length === 0))}
```

Where `hasContent` logic changes to:

```ts
const hasContent = value.trim().length > 0 || (attachments && attachments.length > 0);
```

- [ ] **Step 6: Update home page to pass attachment props**

In `apps/web/src/app/(workspace)/home/page.tsx`, import and use `useImageAttachments`, pass props to `HomePrompt`. This requires the home page to have access to `accessToken` (check current implementation and pass accordingly).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/home-prompt.tsx apps/web/src/app/(workspace)/home/page.tsx
git commit -m "feat: enable image attach button in HomePrompt with upload support"
```

---

### Task 12: Canvas Image Picker — @ Popover

**Files:**
- Create: `apps/web/src/components/canvas-image-picker.tsx`
- Modify: `apps/web/src/components/chat-sidebar.tsx` (add @ trigger and picker)

- [ ] **Step 1: Create CanvasImagePicker component**

```tsx
"use client";

import { useEffect, useRef } from "react";

export type CanvasImageItem = {
  id: string;
  name: string;
  thumbnailUrl: string;
  assetId: string;
  url: string;
  mimeType: string;
};

type CanvasImagePickerProps = {
  items: CanvasImageItem[];
  onSelect: (item: CanvasImageItem) => void;
  onClose: () => void;
};

export function CanvasImagePicker({ items, onSelect, onClose }: CanvasImagePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (items.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute bottom-full left-2 mb-2 w-56 rounded-xl border border-[#E3E3E3] bg-white p-3 shadow-lg"
      >
        <p className="text-xs text-[#A4A9B2]">No images on canvas</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-2 mb-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-[#E3E3E3] bg-white shadow-lg"
    >
      <div className="p-2">
        <div className="mb-1.5 px-1 text-[11px] font-medium text-[#A4A9B2]">
          Canvas Images
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#F5F5F7]"
          >
            <img
              src={item.thumbnailUrl}
              alt={item.name}
              className="h-8 w-8 shrink-0 rounded border border-[#E3E3E3] object-cover"
            />
            <span className="truncate text-sm text-[#2F3640]">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate CanvasImagePicker into ChatSidebar**

In `apps/web/src/components/chat-sidebar.tsx`:

Import the picker:
```ts
import { CanvasImagePicker, type CanvasImageItem } from "./canvas-image-picker";
```

Add state for picker visibility:
```ts
const [showImagePicker, setShowImagePicker] = useState(false);
```

Add a function to extract canvas image elements (this depends on how canvas state is accessible — may need to receive canvas elements as props or via context). For now, pass an `onRequestCanvasImages` callback prop:

Add to `ChatSidebarProps`:
```ts
onRequestCanvasImages?: () => CanvasImageItem[];
```

Wire the `@` trigger to ChatInput:
```tsx
<ChatInput
  onSend={handleSend}
  disabled={streaming}
  attachments={imageAttachments}
  onAddFiles={addFiles}
  onRemoveAttachment={removeAttachment}
  isUploading={isUploading}
  onAtTrigger={() => setShowImagePicker(true)}
/>
```

Render the picker above the input (wrap the input area in a `relative` container):

```tsx
<div className="relative">
  {showImagePicker && onRequestCanvasImages && (
    <CanvasImagePicker
      items={onRequestCanvasImages()}
      onSelect={(item) => {
        addCanvasRef({
          assetId: item.assetId,
          url: item.url,
          mimeType: item.mimeType,
          name: item.name,
        });
      }}
      onClose={() => setShowImagePicker(false)}
    />
  )}
  <ChatInput ... />
</div>
```

- [ ] **Step 3: Wire canvas images from canvas-editor.tsx**

In the canvas page where `ChatSidebar` is rendered, pass the `onRequestCanvasImages` callback that extracts image elements from the tldraw editor state. This implementation depends on the tldraw editor API — extract shapes of type "image" and map them to `CanvasImageItem`.

This will be implemented as part of the integration step — the exact tldraw API depends on how the canvas editor exposes its state.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/canvas-image-picker.tsx apps/web/src/components/chat-sidebar.tsx
git commit -m "feat: add CanvasImagePicker with @ trigger for referencing canvas images"
```

---

### Task 13: Frontend API Update — signedUrl → url

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`

- [ ] **Step 1: Update all signedUrl references**

Search for `signedUrl` in `server-api.ts` and update:

The `getAssetSignedUrl` function name and its return type now use `url`:

```ts
export async function getAssetUrl(
  accessToken: string,
  assetId: string,
): Promise<AssetSignedUrlResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/uploads/${assetId}/url`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as AssetSignedUrlResponse;
}
```

Note: `AssetSignedUrlResponse` type now has `url` instead of `signedUrl` (changed in Task 1).

- [ ] **Step 2: Search frontend for any `.signedUrl` property access and update**

Use grep to find all `.signedUrl` references in the web app and update them to `.url`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server-api.ts
git commit -m "refactor: rename signedUrl to url in frontend API client"
```

---

### Task 14: End-to-End Verification

- [ ] **Step 1: Start dev environment**

Run: `pnpm dev`
Expected: All services (web + server + worker) start without errors.

- [ ] **Step 2: Verify Storage public URL works**

Open Supabase Dashboard → Storage → project-assets → pick any existing file → check that its public URL is accessible without authentication.

- [ ] **Step 3: Test image upload in Chat sidebar**

1. Open a canvas page with the chat sidebar
2. Click the attach (paperclip) button
3. Select an image file
4. Verify: thumbnail appears in attachment bar, upload completes
5. Type a message and send
6. Verify: user message shows with image thumbnail
7. Verify: assistant responds (model received the image)

- [ ] **Step 4: Test image upload in Home page**

1. Go to Home page
2. Click the attach button
3. Select an image
4. Type a prompt and submit
5. Verify: redirects to canvas with image in the first message

- [ ] **Step 5: Test @ canvas image reference**

1. Open a canvas with images on it
2. In the chat sidebar, type `@`
3. Verify: popover shows canvas images
4. Select one
5. Verify: appears in attachment bar
6. Send message
7. Verify: model receives and responds about the image

- [ ] **Step 6: Test error scenarios**

1. Try uploading a file > 10MB → should show error in attachment bar
2. Try uploading a non-image file → should be filtered out
3. Test with many images → if model errors, `run.failed` event should surface error message

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete image upload and multimodal chat support"
```
