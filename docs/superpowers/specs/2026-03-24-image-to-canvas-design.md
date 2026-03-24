# Image Generation → Canvas Display Pipeline

## Goal

When the agent generates an image via `generate_image` tool, the result must:
1. Appear as a visual preview in the chat sidebar (inline thumbnail)
2. Be inserted as an Excalidraw image element on the canvas (auto-positioned)

Currently, the tool returns `{ imageUrl, mimeType, width, height }` but `stream-adapter.ts` discards this structured data — only a text `outputSummary` reaches the frontend.

## Architecture

Five-layer pipeline, each layer independently testable:

```
[Tool Output] → [Stream Adapter] → [SSE Event] → [Chat UI] → [Canvas]
     ↓                ↓                 ↓             ↓           ↓
  structured     extract artifacts   tool.completed  thumbnail  Excalidraw
  JSON result    from ToolMessage    + artifacts[]   + callback  addFiles +
                                                                updateScene
```

## Layer 1: Schema Extension

### `packages/shared/src/events.ts`

Add an `artifacts` field to the `tool.completed` event. Artifacts are typed media objects produced by tools.

```typescript
export const imageArtifactSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const toolArtifactSchema = z.discriminatedUnion("type", [
  imageArtifactSchema,
]);

export const toolCompletedEventSchema = z.object({
  type: z.literal("tool.completed"),
  runId: runIdSchema,
  toolCallId: toolCallIdSchema,
  toolName: z.string().min(1),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(), // NEW
  timestamp: timestampSchema,
});
```

### `packages/shared/src/contracts.ts`

The `chatToolActivitySchema` must also carry artifacts for persistence round-trip (messages saved to Supabase include `toolActivities`):

```typescript
export const chatToolActivitySchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(), // NEW
});
```

Import `toolArtifactSchema` from `events.ts`, or define in `contracts.ts` and re-export from both. Prefer defining in `events.ts` and importing in `contracts.ts`.

### `packages/shared/src/index.ts`

Export new types: `ImageArtifact`, `ToolArtifact`, `imageArtifactSchema`, `toolArtifactSchema`.

**Why discriminated union for artifacts:** Extensible to `video`, `audio`, etc. later without breaking existing consumers. Consumers that don't understand an artifact type can safely ignore it.

## Layer 2: Stream Adapter (`apps/server/src/agent/stream-adapter.ts`)

Add an `extractArtifacts()` function that inspects tool output (ToolMessage content) for structured media data.

The `generate_image` tool returns JSON with `{ imageUrl, mimeType, width, height }`. When the stream adapter sees a `on_tool_end` event, it:
1. Calls existing `summarizeOutput()` for `outputSummary` (unchanged)
2. Calls new `extractArtifacts()` to look for image data in the output
3. Passes both on the `tool.completed` SSE event

```typescript
function extractArtifacts(output: unknown): ToolArtifact[] | undefined {
  // Follow same pattern as summarizeOutput(): ToolMessage → extractChunkText → tryParseJson
  const text = ToolMessageClass.isInstance(output)
    ? extractChunkText(output)
    : typeof output === "string"
      ? output
      : output && typeof output === "object"
        ? JSON.stringify(output)
        : "";

  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") return undefined;

  const artifacts: ToolArtifact[] = [];

  // Use imageArtifactSchema.safeParse for type-safe validation
  const candidate = {
    type: "image" as const,
    url: (parsed as Record<string, unknown>).imageUrl,
    mimeType: (parsed as Record<string, unknown>).mimeType,
    width: (parsed as Record<string, unknown>).width,
    height: (parsed as Record<string, unknown>).height,
  };
  const result = imageArtifactSchema.safeParse(candidate);
  if (result.success) {
    artifacts.push(result.data);
  }

  // Error case (generate_image returns { summary, error } on failure) naturally
  // falls through — no imageUrl field means safeParse fails, no artifact produced.

  return artifacts.length > 0 ? artifacts : undefined;
}
```

In the `on_tool_end` handler, add `artifacts` to the yielded event:

```typescript
yield {
  outputSummary: summarizeOutput(output),
  artifacts: extractArtifacts(output), // NEW
  runId: options.runId,
  timestamp: now(),
  toolCallId,
  toolName,
  type: "tool.completed",
};
```

**No changes to tool code.** The existing `generate_image` tool already returns the right shape — we just need to stop discarding it.

## Layer 3: Canvas API Bridge (Frontend)

### Problem

`CanvasEditor` and `ChatSidebar` are siblings in `canvas/page.tsx`. They share no state. The canvas Excalidraw API is encapsulated inside `CanvasEditor` with no external access.

### Solution: Callback props (simplest, explicit)

**`canvas-editor.tsx`:** Accept an `onApiReady(api: ExcalidrawImperativeAPI)` callback prop. Internally, wire this to Excalidraw's `excalidrawAPI` prop (Excalidraw's built-in callback prop for exposing its imperative API).

**`canvas/page.tsx`:** Hold ExcalidrawAPI ref. Pass it to a new `addImageToCanvas()` handler. Pass that handler to ChatSidebar via prop.

**`chat-sidebar.tsx`:** Accept `onImageGenerated(artifact: ImageArtifact)` callback. The callback must fire from the streaming loop in `handleSend` (not inside `handleStreamEvent`) to avoid side effects in a state setter. Both `handleStreamEvent` and the local `assistantTools` tracking in `handleSend` must propagate `artifacts`.

```
canvas/page.tsx
  ├── CanvasEditor  → onApiReady(api)  → page stores api ref
  └── ChatSidebar   → onImageGenerated(artifact)  → page calls insertImageOnCanvas(api, artifact)
```

**Why not a context:** Only 2 components at the same level, 1 level of prop passing. A context would add complexity without benefit here. Can be refactored to context if more consumers appear later.

## Layer 4: Chat Image Preview (`apps/web/src/components/chat-message.tsx`)

When a tool activity has image artifacts, render a thumbnail below the tool status line.

```
✓ Generate Image — Generated image (1024x1024) via replicate/...
  ┌──────────────┐
  │              │  ← clickable thumbnail (max 200px wide)
  │   [image]    │
  │              │
  └──────────────┘
```

The `ToolActivity` type gets an optional `artifacts` field matching the shared schema. The component renders `<img>` with the artifact URL, rounded corners, max-width constraint.

## Layer 5: Canvas Element Insertion (`apps/web/src/lib/canvas-elements.ts`)

New utility module that creates Excalidraw image elements from artifacts. References Jaaz's `generate_new_image_element()` pattern.

### Excalidraw type requirements

- `BinaryFileData.id` requires branded `FileId` type — cast with `as FileId`
- `BinaryFileData.dataURL` requires branded `DataURL` type — cast with `as DataURL`
- `BinaryFileData.mimeType` must be one of `IMAGE_MIME_TYPES` values (e.g., `"image/png"`)
- `ExcalidrawImageElement` requires ~20+ fields. Construct manually with sensible defaults following Jaaz's pattern (see below). Excalidraw does NOT export a public `newImageElement` factory.

### Image loading flow

1. Fetch image from URL → convert to data URL (Excalidraw requires data URLs for `addFiles`)
2. Generate unique fileId (nanoid)
3. Create Excalidraw `BinaryFileData`: `{ id: fileId as FileId, dataURL: dataURL as DataURL, mimeType, created }`
4. Create Excalidraw image element with all required fields + dimensions scaled to max 600px (preserving aspect ratio)
5. Position: center of current viewport

### CORS and error handling

Replicate CDN URLs (`replicate.delivery`) support CORS for GET requests on images. If `fetchAsDataURL` fails (expired URL, network error, CORS), catch the error and:
1. Show a toast/warning in the chat that the image couldn't be loaded onto canvas
2. Still display the thumbnail in chat via `<img src={url}>` (img tags bypass CORS)
3. Do NOT throw — the run should not fail because of a canvas insertion failure

### Excalidraw element construction

Following Jaaz's `generate_new_image_element()` pattern, manually construct with defaults:

```typescript
function createExcalidrawImageElement(opts: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Record<string, unknown> {
  return {
    type: "image",
    id: nanoid(),
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    angle: 0,
    fileId: opts.fileId,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    roundness: null,
    boundElements: null,
    frameId: null,
    index: null,
    seed: Math.floor(Math.random() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2_000_000_000),
    isDeleted: false,
    updated: Date.now(),
    link: null,
    locked: false,
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
}
```

### Positioning

Place at viewport center. Excalidraw API's `getAppState()` provides `scrollX`, `scrollY`, `width`, `height`, and `zoom`. Viewport center:

```typescript
function getViewportCenter(appState: AppState): { x: number; y: number } {
  const zoom = appState.zoom?.value ?? 1;
  return {
    x: -appState.scrollX + appState.width / (2 * zoom),
    y: -appState.scrollY + appState.height / (2 * zoom),
  };
}
```

### Canvas insertion with undo support

Use `captureUpdate: CaptureUpdateAction.IMMEDIATELY` on `updateScene` so the insertion is immediately undoable:

```typescript
api.updateScene({
  elements: [...api.getSceneElements(), element],
  captureUpdate: CaptureUpdateAction.IMMEDIATELY,
});
```

The existing auto-save debounce in `CanvasEditor.handleChange` will persist the new element to Supabase within 1500ms.

## Data Flow Summary

```
1. Agent calls generate_image tool
2. Replicate API returns image URL + dimensions
3. Tool returns { summary, imageUrl, mimeType, width, height }
4. stream-adapter: on_tool_end → extractArtifacts() finds image data via safeParse
5. SSE: tool.completed event includes artifacts: [{ type: "image", url, mimeType, width, height }]
6. Frontend: streamEvents yields tool.completed with artifacts
7. chat-sidebar handleSend loop: updates ToolActivity with artifacts, calls onImageGenerated callback
8. chat-message: renders image thumbnail in tool activity section
9. canvas/page: receives callback, calls insertImageOnCanvas(excalidrawApi, artifact)
10. canvas-editor: Excalidraw renders the new image element (undoable via CaptureUpdateAction)
11. Auto-save persists to Supabase (existing 1500ms debounce)
```

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/src/events.ts` | Modify | Add artifact schemas + extend tool.completed |
| `packages/shared/src/contracts.ts` | Modify | Add artifacts to chatToolActivitySchema |
| `packages/shared/src/index.ts` | Modify | Export new types and schemas |
| `apps/server/src/agent/stream-adapter.ts` | Modify | Add extractArtifacts(), pass on tool.completed |
| `apps/web/src/lib/canvas-elements.ts` | Create | Excalidraw element creation + image insertion |
| `apps/web/src/components/canvas-editor.tsx` | Modify | Expose ExcalidrawAPI via onApiReady → excalidrawAPI |
| `apps/web/src/components/chat-message.tsx` | Modify | Render image artifact thumbnails + artifacts in ToolActivity type |
| `apps/web/src/components/chat-sidebar.tsx` | Modify | Propagate artifacts in handleStreamEvent + handleSend, call onImageGenerated |
| `apps/web/src/app/canvas/page.tsx` | Modify | Bridge ExcalidrawAPI ↔ ChatSidebar via insertImageOnCanvas |

## Testing Strategy

- **Unit:** `extractArtifacts()` pure function tests — image output produces artifact, error output produces none, non-image tool produces none
- **Unit:** `createExcalidrawImageElement()` + `scaleToFit()` + `getViewportCenter()` pure function tests
- **Unit:** `ChatMessage` component renders image thumbnail when artifacts present, no image when absent
- **Unit:** `insertImageOnCanvas` with mocked ExcalidrawAPI — verifies addFiles + updateScene calls
- **Integration:** `stream-adapter.test.ts` — verify image tool output produces artifacts in tool.completed event
- **Integration:** `mock-runs.test.ts` — verify SSE frames carry artifacts
- **E2E (manual):** Generate an image via chat, verify thumbnail in chat + element on canvas

## Non-Goals

- Video generation display (future, same pattern)
- Image editing/manipulation on canvas
- Image persistence to dedicated storage (images stay at Replicate URLs for now)
- Multi-user real-time sync of generated images
