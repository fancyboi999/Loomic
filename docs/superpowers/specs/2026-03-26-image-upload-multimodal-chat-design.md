# Image Upload & Multimodal Chat Design

## Overview

Enable image input across three entry points — Home page, Chat sidebar, and Canvas chatbar (`@` reference) — so users can send images alongside text to the AI model for analysis and processing.

## Key Decisions

- **Images only** (png/jpeg/webp/gif), no documents for now
- **No quantity limit** — errors from token overflow are caught and surfaced to the user
- **Local upload → base64 not used** — all images go through Supabase Storage, model receives public URL
- **Canvas `@` reference** — user types `@` in chatbar, popover shows canvas image elements, select to attach
- **`project-assets` bucket → public** — enables permanent URLs, no signed URL expiry, future sharing support
- **`user-avatars` bucket unchanged** — stays private/signed

## Section 1: Data Types & Message Protocol

### 1.1 New ContentBlock: `ImageBlock`

Current `ContentBlock = TextBlock | ToolBlock`. Add:

```ts
type ImageBlock = {
  type: "image"
  assetId: string           // asset_objects.id
  url: string               // public URL
  mimeType: string          // image/png, image/jpeg, etc.
  source: "upload" | "canvas-ref"
}

type ContentBlock = TextBlock | ToolBlock | ImageBlock
```

### 1.2 RunCreateRequest Extension

Add `attachments` to carry image references to the agent runtime:

```ts
type RunCreateRequest = {
  sessionId: string
  conversationId: string
  prompt: string
  canvasId?: string
  attachments?: ImageAttachment[]  // NEW
}

type ImageAttachment = {
  assetId: string
  url: string
  mimeType: string
}
```

### 1.3 Server → LangChain Message Construction

`runtime.ts` changes from plain string to conditional ContentBlock array:

```ts
messages: [{
  content: attachments.length > 0
    ? [
        { type: "text", text: run.prompt },
        ...attachments.map(a => ({ type: "image", url: a.url, mimeType: a.mimeType }))
      ]
    : run.prompt,
  role: "user",
}]
```

No attachments → plain string (backward compatible). With attachments → ContentBlock array.

## Section 2: Storage Public URL Migration

### 2.1 Bucket Configuration

```sql
UPDATE storage.buckets SET public = true WHERE id = 'project-assets';
```

### 2.2 Public URL Helper

Replace `createSignedUrl` with synchronous `getPublicUrl` for `project-assets` bucket:

```ts
function getPublicAssetUrl(client: SupabaseClient, bucket: string, objectPath: string): string {
  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
```

`getPublicUrl` is pure string concatenation — no network request, not async, cannot fail.

### 2.3 Migration Scope

All `createSignedUrl` calls for `project-assets` bucket → `getPublicUrl`:

| File | Context |
|------|---------|
| `upload-service.ts` | Upload return URL, getSignedUrl helper |
| `runtime.ts:325` | Image generation result URL |
| `image-generation.ts:96` | Job completion URL |
| `brand-kit.ts:45` | Brand asset URLs |
| `brand-kit-service.ts:148,619` | Brand asset batch URLs |
| `canvas-service.ts:204` | Canvas element image URLs |
| `project-service.ts:324,510` | Project thumbnail URLs |

`user-avatars` bucket retains signed URLs — no change.

## Section 3: Frontend Interaction & Components

### 3.1 Shared Hook: `useImageAttachments`

All three input points share attachment logic via a custom hook:

```ts
useImageAttachments(options?: { maxSizeMB?: number }) => {
  attachments: ImageAttachmentState[]
  addFiles: (files: File[]) => void
  addCanvasRef: (asset: CanvasImageRef) => void
  removeAttachment: (id: string) => void
  clearAll: () => void
  isUploading: boolean
}

type ImageAttachmentState = {
  id: string
  file?: File
  preview: string           // local object URL or public URL
  uploading: boolean
  error?: string
  assetId?: string          // set after upload completes
  url?: string              // public URL from Storage
  mimeType: string
  source: "upload" | "canvas-ref"
}
```

### 3.2 Local Upload Interaction

- Click Attach button → triggers hidden `<input type="file" accept="image/*" multiple />`
- Drag & drop supported
- On selection: 1) generate local preview (`URL.createObjectURL`), 2) call `uploadFile()` to Storage
- Thumbnail bar above input shows: thumbnail + upload progress/status + remove button
- Send button disabled while any upload in progress
- Upload failure shows retry option

### 3.3 Canvas `@` Reference Interaction

- User types `@` in chatbar → popover appears
- Lists all image elements on current canvas (filter `type === "image"` from canvas state)
- Each item shows: thumbnail + element name (auto-numbered "Image 1", "Image 2"...)
- Selection adds to attachment bar + inserts `@Image N` text marker
- Data source: canvas image elements already have `objectPath`/`src`, construct public URL directly

### 3.4 Attachment Preview Bar

Positioned above input, below message area. Horizontal layout:

```
┌──────────────────────────────────────────────┐
│ [thumb] ✕  [thumb] ✕  [thumb ⟳uploading...]  │  ← attachment bar
├──────────────────────────────────────────────┤
│ Message input...                         📎  │  ← input + Attach button
└──────────────────────────────────────────────┘
```

Only visible when attachments exist. Minimal, non-intrusive.

### 3.5 Image Display in Message Bubbles

When user message `contentBlocks` contains `ImageBlock`, render clickable thumbnails inline in the message bubble.

## Section 4: Error Handling

| Scenario | Handling |
|----------|----------|
| Model token overflow (too many images) | Catch LLM 400/413, push via `run.failed` SSE event, frontend shows "too many images" hint |
| Image URL unreachable | Model error → `run.failed` → frontend shows "image load failed" |
| Upload failure | Frontend-side: attachment bar shows error + retry button, does not block text send |
| Single image too large | Frontend validates before upload: 10MB limit per image, prompt to compress |

No special interception — let requests reach the model naturally, errors flow back through existing `run.failed` SSE event pipeline.

## Section 5: End-to-End Data Flow

### 5.1 Local Upload Flow

```
User clicks 📎 / drags image
  → <input type="file"> triggers
  → useImageAttachments.addFiles()
    → URL.createObjectURL() for local preview
    → uploadFile() → POST /api/uploads → Supabase Storage (public bucket)
    → returns { assetId, publicUrl }
  → attachment bar shows thumbnail ✓

User clicks send
  → handleSend(text, attachments)
  → build contentBlocks: [TextBlock, ...ImageBlock[]]
  → saveMessage() persists to DB (fire & forget)
  → createRun({ prompt, attachments: [{assetId, url, mimeType}] })
    → POST /api/agent/runs
    → Server validates assetId exists
    → runtime.ts builds LangChain message:
        content: [
          { type: "text", text: prompt },
          { type: "image", url: publicUrl, mimeType }
        ]
    → deepagents.streamEvents() → LLM processes image+text
    → SSE stream returns assistant response
  → frontend renders assistant reply
```

### 5.2 Canvas `@` Reference Flow

```
User types @ in chatbar
  → popover lists canvas image elements
  → user selects one
  → useImageAttachments.addCanvasRef({ assetId, url, mimeType })
    → attachment bar shows thumbnail (no upload needed, already in Storage)
    → text gets @Image marker

Send flow identical to upload (attachments carry source: "canvas-ref")
```

### 5.3 History Message Rendering

```
GET /api/sessions/:id/messages
  → returns contentBlocks with ImageBlock
  → ChatMessage component renders by block.type:
    - "text" → text
    - "image" → thumbnail (public URL, permanent)
    - "tool" → tool activity (existing logic)
```

## File Change Manifest

| Layer | File | Change |
|-------|------|--------|
| **Shared types** | `packages/shared/src/contracts.ts` | Add `ImageBlock`, extend `ContentBlock`, extend `RunCreateRequest` |
| **Storage** | Supabase migration SQL | `project-assets` bucket → public |
| **Server** | `upload-service.ts` | `createSignedUrl` → `getPublicUrl` for project-assets |
| **Server** | `runtime.ts` | Message construction with attachments → ContentBlock array |
| **Server** | `image-generation.ts` | signed → public URL |
| **Server** | `brand-kit.ts` / `brand-kit-service.ts` | signed → public URL |
| **Server** | `canvas-service.ts` | signed → public URL |
| **Server** | `project-service.ts` | signed → public URL |
| **Server** | `http/models.ts` | RunCreateRequest validation with attachments |
| **Server** | `http/chat.ts` | Message creation accepts ImageBlock |
| **Frontend** | NEW `hooks/use-image-attachments.ts` | Attachment state management hook |
| **Frontend** | `home-prompt.tsx` | Enable Attach button + attachment bar |
| **Frontend** | `chat-input.tsx` | Add Attach button + attachment bar |
| **Frontend** | `chat-sidebar.tsx` | handleSend passes attachments, createRun carries attachments |
| **Frontend** | `chat-message.tsx` | Render ImageBlock thumbnails |
| **Frontend** | NEW `components/image-attachment-bar.tsx` | Attachment preview bar component |
| **Frontend** | NEW `components/canvas-image-picker.tsx` | `@` triggered canvas image popover |
