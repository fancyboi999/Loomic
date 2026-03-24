# Image-to-Canvas Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the agent generates an image, display a thumbnail in chat and insert it as an Excalidraw element on the canvas.

**Architecture:** Five-layer pipeline: extend shared event schema with typed artifacts → extract image metadata in stream adapter → bridge ExcalidrawAPI between canvas and chat components via callback props → render thumbnails in chat messages → create Excalidraw image elements on canvas.

**Tech Stack:** Zod (schema), LangChain ToolMessage (server), Excalidraw 0.18 API (canvas), React (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-24-image-to-canvas-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/events.ts` | Modify | Add `imageArtifactSchema`, `toolArtifactSchema`, extend `toolCompletedEventSchema` |
| `packages/shared/src/contracts.ts` | Modify | Add `artifacts` to `chatToolActivitySchema` (import from events.ts) |
| `apps/server/src/agent/stream-adapter.ts` | Modify | Add `extractArtifacts()`, wire into `on_tool_end` handler |
| `apps/server/test/stream-adapter.test.ts` | Modify | Add tests for artifact extraction |
| `apps/web/src/lib/canvas-elements.ts` | Create | `insertImageOnCanvas()`, `fetchAsDataURL()`, `scaleToFit()`, `getViewportCenter()`, `createExcalidrawImageElement()` |
| `apps/web/src/components/canvas-editor.tsx` | Modify | Accept `onApiReady` prop, wire to Excalidraw's `excalidrawAPI` |
| `apps/web/src/components/chat-message.tsx` | Modify | Add `artifacts` to `ToolActivity`, render image thumbnails |
| `apps/web/src/components/chat-sidebar.tsx` | Modify | Propagate artifacts, accept+call `onImageGenerated` |
| `apps/web/src/app/canvas/page.tsx` | Modify | Bridge ExcalidrawAPI ↔ onImageGenerated |

---

### Task 1: Extend shared event schema with artifact types

**Files:**
- Modify: `packages/shared/src/events.ts:28-44`
- Modify: `packages/shared/src/contracts.ts:104-109`

- [ ] **Step 1: Add artifact schemas to events.ts**

Open `packages/shared/src/events.ts`. Before the `toolCompletedEventSchema` definition (line 37), add:

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

export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type ToolArtifact = z.infer<typeof toolArtifactSchema>;
```

Then modify `toolCompletedEventSchema` to add the `artifacts` field:

```typescript
export const toolCompletedEventSchema = z.object({
  type: z.literal("tool.completed"),
  runId: runIdSchema,
  toolCallId: toolCallIdSchema,
  toolName: z.string().min(1),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
  timestamp: timestampSchema,
});
```

- [ ] **Step 2: Add artifacts to chatToolActivitySchema in contracts.ts**

Open `packages/shared/src/contracts.ts`. Add import at the top:

```typescript
import { toolArtifactSchema } from "./events.js";
```

Modify `chatToolActivitySchema` (line 104-109):

```typescript
export const chatToolActivitySchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
});
```

- [ ] **Step 3: Verify shared package builds**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/src/contracts.ts
git commit -m "feat: add artifact schema to tool.completed event and chat activity"
```

---

### Task 2: Extract image artifacts in stream adapter

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts:143-161`
- Modify: `apps/server/test/stream-adapter.test.ts`

- [ ] **Step 1: Write the failing test for extractArtifacts**

Open `apps/server/test/stream-adapter.test.ts`. Add a new test case inside the existing `describe` block, after the last `it(...)`:

```typescript
it("extracts image artifacts from generate_image tool output", async () => {
  const imageToolOutput = JSON.stringify({
    summary: "Generated image (1024x1024) via replicate/flux-kontext-pro",
    imageUrl: "https://replicate.delivery/test/image.png",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
  });

  const stream = makeStream([
    {
      event: "on_tool_start",
      name: "generate_image",
      data: { input: { prompt: "a cat" } },
      run_id: "tool_run_img",
    },
    {
      event: "on_tool_end",
      name: "generate_image",
      data: {
        output: new ToolMessage({
          content: imageToolOutput,
          name: "generate_image",
          tool_call_id: "tool_call_img",
        }),
      },
      run_id: "tool_run_img",
    },
  ]);

  const events = await collectEvents(
    adaptDeepAgentStream({
      conversationId: "conversation_123",
      now: () => "2026-03-24T12:00:00.000Z",
      runId: "run_123",
      sessionId: "session_123",
      stream,
    }),
  );

  const toolCompleted = events.find(
    (e: any) => e.type === "tool.completed",
  ) as any;

  expect(toolCompleted).toBeDefined();
  expect(toolCompleted.artifacts).toEqual([
    {
      type: "image",
      url: "https://replicate.delivery/test/image.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    },
  ]);
});

it("does not produce artifacts for non-image tool output", async () => {
  const stream = makeStream([
    {
      event: "on_tool_start",
      name: "project_search",
      data: { input: { query: "test" } },
      run_id: "tool_run_search",
    },
    {
      event: "on_tool_end",
      name: "project_search",
      data: {
        output: new ToolMessage({
          content: JSON.stringify({
            matchCount: 2,
            summary: "Matched 2 files",
          }),
          name: "project_search",
          tool_call_id: "tool_call_search",
        }),
      },
      run_id: "tool_run_search",
    },
  ]);

  const events = await collectEvents(
    adaptDeepAgentStream({
      conversationId: "conversation_123",
      now: () => "2026-03-24T12:00:00.000Z",
      runId: "run_123",
      sessionId: "session_123",
      stream,
    }),
  );

  const toolCompleted = events.find(
    (e: any) => e.type === "tool.completed",
  ) as any;

  expect(toolCompleted).toBeDefined();
  expect(toolCompleted.artifacts).toBeUndefined();
});

it("does not produce artifacts for failed image generation", async () => {
  const stream = makeStream([
    {
      event: "on_tool_start",
      name: "generate_image",
      data: { input: { prompt: "a cat" } },
      run_id: "tool_run_fail",
    },
    {
      event: "on_tool_end",
      name: "generate_image",
      data: {
        output: new ToolMessage({
          content: JSON.stringify({
            summary: "Image generation failed: timeout",
            error: "timeout",
          }),
          name: "generate_image",
          tool_call_id: "tool_call_fail",
        }),
      },
      run_id: "tool_run_fail",
    },
  ]);

  const events = await collectEvents(
    adaptDeepAgentStream({
      conversationId: "conversation_123",
      now: () => "2026-03-24T12:00:00.000Z",
      runId: "run_123",
      sessionId: "session_123",
      stream,
    }),
  );

  const toolCompleted = events.find(
    (e: any) => e.type === "tool.completed",
  ) as any;

  expect(toolCompleted).toBeDefined();
  expect(toolCompleted.artifacts).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run test/stream-adapter.test.ts`
Expected: 3 new tests FAIL (artifacts field missing on tool.completed events)

- [ ] **Step 3: Implement extractArtifacts in stream-adapter.ts**

Open `apps/server/src/agent/stream-adapter.ts`.

Add import at top (after existing imports):

```typescript
import { imageArtifactSchema } from "@loomic/shared";
import type { ToolArtifact } from "@loomic/shared";
```

Add `extractArtifacts` function before the existing `extractChunkText` function (around line 200):

```typescript
function extractArtifacts(output: unknown): ToolArtifact[] | undefined {
  let text = "";
  if (ToolMessageClass.isInstance(output)) {
    text = extractChunkText(output);
  } else if (typeof output === "string") {
    text = output;
  } else if (output && typeof output === "object") {
    text = JSON.stringify(output);
  }

  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") return undefined;

  const artifacts: ToolArtifact[] = [];
  const record = parsed as Record<string, unknown>;

  const candidate = {
    type: "image" as const,
    url: record.imageUrl,
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
  };

  const result = imageArtifactSchema.safeParse(candidate);
  if (result.success) {
    artifacts.push(result.data);
  }

  return artifacts.length > 0 ? artifacts : undefined;
}
```

Then modify the `on_tool_end` handler (around line 152-161). Change the yield to include artifacts:

```typescript
const output = evt.data?.output;
yield {
  outputSummary: summarizeOutput(output),
  artifacts: extractArtifacts(output),
  runId: options.runId,
  timestamp: now(),
  toolCallId,
  toolName,
  type: "tool.completed",
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run test/stream-adapter.test.ts`
Expected: All tests PASS (including the 3 existing tests)

- [ ] **Step 5: Run the full server test suite**

Run: `cd apps/server && npx vitest run`
Expected: All existing tests continue to pass. The `mock-runs.test.ts` and `deep-agent-runtime.test.ts` tests use `expect.objectContaining` which tolerates the new optional `artifacts` field.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts apps/server/test/stream-adapter.test.ts
git commit -m "feat: extract image artifacts from tool output in stream adapter"
```

---

### Task 3: Create canvas-elements utility module

**Files:**
- Create: `apps/web/src/lib/canvas-elements.ts`

- [ ] **Step 1: Create the canvas-elements module**

Create `apps/web/src/lib/canvas-elements.ts` with these pure utility functions:

```typescript
import type { ImageArtifact } from "@loomic/shared";

/**
 * Scale dimensions to fit within maxSize while preserving aspect ratio.
 */
export function scaleToFit(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const ratio = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Compute the center of the current Excalidraw viewport.
 */
export function getViewportCenter(appState: {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  zoom: { value: number };
}): { x: number; y: number } {
  const zoom = appState.zoom?.value ?? 1;
  return {
    x: -appState.scrollX + appState.width / (2 * zoom),
    y: -appState.scrollY + appState.height / (2 * zoom),
  };
}

/**
 * Create an Excalidraw image element with all required fields.
 * Based on Jaaz's generate_new_image_element() pattern.
 */
export function createExcalidrawImageElement(opts: {
  fileId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): Record<string, unknown> {
  return {
    type: "image",
    id: generateId(),
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

/**
 * Fetch an image URL and convert it to a data URL string.
 */
export async function fetchAsDataURL(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to convert image to data URL"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Insert an image artifact onto the Excalidraw canvas.
 *
 * @param api - Excalidraw imperative API (from excalidrawAPI callback)
 * @param artifact - Image artifact with url, mimeType, width, height
 */
export async function insertImageOnCanvas(
  api: {
    addFiles: (files: { id: any; dataURL: any; mimeType: string; created: number }[]) => void;
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: { elements: any[]; captureUpdate?: any }) => void;
  },
  artifact: ImageArtifact,
): Promise<void> {
  const dataURL = await fetchAsDataURL(artifact.url);
  const fileId = generateId();

  api.addFiles([
    {
      id: fileId as any,
      dataURL: dataURL as any,
      mimeType: artifact.mimeType,
      created: Date.now(),
    },
  ]);

  const scaled = scaleToFit(artifact.width, artifact.height, 600);
  const center = getViewportCenter(api.getAppState());

  const element = createExcalidrawImageElement({
    fileId,
    x: center.x - scaled.width / 2,
    y: center.y - scaled.height / 2,
    width: scaled.width,
    height: scaled.height,
  });

  api.updateScene({
    elements: [...api.getSceneElements(), element],
  });
}

function generateId(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 20);
}
```

- [ ] **Step 2: Verify web app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/canvas-elements.ts
git commit -m "feat: add canvas-elements utility for Excalidraw image insertion"
```

---

### Task 4: Expose ExcalidrawAPI from canvas-editor

**Files:**
- Modify: `apps/web/src/components/canvas-editor.tsx`

- [ ] **Step 1: Add onApiReady prop and wire to Excalidraw**

Open `apps/web/src/components/canvas-editor.tsx`.

Update the props type (line 16-23):

```typescript
type CanvasEditorProps = {
  canvasId: string;
  accessToken: string;
  initialContent: {
    elements: Record<string, unknown>[];
    appState: Record<string, unknown>;
  };
  onApiReady?: (api: any) => void;
};
```

Update the component signature to destructure the new prop (line 27-31):

```typescript
export function CanvasEditor({
  canvasId,
  accessToken,
  initialContent,
  onApiReady,
}: CanvasEditorProps) {
```

Add the `excalidrawAPI` prop to the `<Excalidraw>` component (around line 66-73):

```typescript
<Excalidraw
  theme={resolvedTheme === "dark" ? "dark" : "light"}
  initialData={{
    elements: initialContent.elements as any,
    appState: initialContent.appState as any,
  }}
  onChange={handleChange}
  excalidrawAPI={onApiReady}
/>
```

- [ ] **Step 2: Verify web app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/canvas-editor.tsx
git commit -m "feat: expose ExcalidrawAPI via onApiReady callback in canvas-editor"
```

---

### Task 5: Add image artifact rendering to chat-message

**Files:**
- Modify: `apps/web/src/components/chat-message.tsx`

- [ ] **Step 1: Update ToolActivity type and render image artifacts**

Open `apps/web/src/components/chat-message.tsx`.

Update the `ToolActivity` type (line 3-8) to include artifacts:

```typescript
type ToolArtifact = {
  type: "image";
  url: string;
  mimeType: string;
  width: number;
  height: number;
};

type ToolActivity = {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed";
  outputSummary?: string | undefined;
  artifacts?: ToolArtifact[] | undefined;
};
```

Inside the tool activities rendering section (inside the `.map((tool) => ...)` around line 51-76), add image thumbnails after the tool status line. Replace the entire `toolActivities.map(...)` block:

```typescript
{toolActivities.map((tool) => (
  <div key={tool.toolCallId} className="space-y-1.5">
    <div className="flex items-center gap-1.5 text-[11px] text-[#A4A9B2]">
      {tool.status === "running" ? (
        <div className="h-3 w-3 animate-spin rounded-full border border-[#A4A9B2]/40 border-t-[#A4A9B2]" />
      ) : (
        <svg
          className="h-3 w-3 text-green-500"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
      )}
      <span className="font-medium">
        {formatToolName(tool.toolName)}
      </span>
      {tool.outputSummary && (
        <span className="truncate opacity-60">
          — {tool.outputSummary}
        </span>
      )}
    </div>
    {tool.artifacts?.map((artifact) =>
      artifact.type === "image" ? (
        <img
          key={artifact.url}
          src={artifact.url}
          alt="Generated image"
          className="max-w-[200px] rounded-md border border-[#E3E3E3]"
          loading="lazy"
        />
      ) : null,
    )}
  </div>
))}
```

- [ ] **Step 2: Verify web app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat-message.tsx
git commit -m "feat: render image artifact thumbnails in chat messages"
```

---

### Task 6: Propagate artifacts in chat-sidebar and wire onImageGenerated

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx`

- [ ] **Step 1: Update imports and props**

Open `apps/web/src/components/chat-sidebar.tsx`.

Add `ImageArtifact` import from shared (line 6-12 area). Update the import:

```typescript
import type {
  ChatMessage as ChatMessageData,
  ChatSessionSummary,
  ImageArtifact,
  StreamEvent,
} from "@loomic/shared";
```

Update `ChatSidebarProps` type (around line 31-36):

```typescript
type ChatSidebarProps = {
  accessToken: string;
  canvasId: string;
  open: boolean;
  onToggle: () => void;
  onImageGenerated?: (artifact: ImageArtifact) => void;
};
```

Destructure the new prop in the component signature:

```typescript
export function ChatSidebar({
  accessToken,
  canvasId,
  open,
  onToggle,
  onImageGenerated,
}: ChatSidebarProps) {
```

- [ ] **Step 2: Propagate artifacts in handleStreamEvent**

In the `handleStreamEvent` callback (around line 184-250), update the `tool.completed` case to propagate artifacts:

```typescript
case "tool.completed":
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? {
            ...m,
            toolActivities: m.toolActivities?.map((t) =>
              t.toolCallId === event.toolCallId
                ? {
                    ...t,
                    status: "completed" as const,
                    outputSummary: event.outputSummary,
                    artifacts: event.artifacts?.map((a) => ({
                      type: a.type,
                      url: (a as any).url,
                      mimeType: (a as any).mimeType,
                      width: (a as any).width,
                      height: (a as any).height,
                    })),
                  }
                : t,
            ),
          }
        : m,
    ),
  );
  break;
```

- [ ] **Step 3: Fire onImageGenerated in streaming loop and propagate artifacts in local tracking**

In the `handleSend` function, find the `tool.completed` tracking section (around line 322-330). Update to propagate artifacts and fire the callback:

```typescript
if (event.type === "tool.completed" && assistantTools) {
  const tool = assistantTools.find(
    (t) => t.toolCallId === event.toolCallId,
  );
  if (tool) {
    tool.status = "completed";
    tool.outputSummary = event.outputSummary;
    if (event.artifacts) {
      tool.artifacts = event.artifacts.map((a) => ({
        type: a.type,
        url: (a as any).url,
        mimeType: (a as any).mimeType,
        width: (a as any).width,
        height: (a as any).height,
      }));
    }
  }

  // Fire canvas insertion callback for image artifacts
  if (event.artifacts && onImageGenerated) {
    for (const artifact of event.artifacts) {
      if (artifact.type === "image") {
        onImageGenerated(artifact as ImageArtifact);
      }
    }
  }
}
```

- [ ] **Step 4: Verify web app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx
git commit -m "feat: propagate image artifacts in chat sidebar and fire onImageGenerated"
```

---

### Task 7: Bridge ExcalidrawAPI ↔ ChatSidebar in canvas page

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx`

- [ ] **Step 1: Wire everything together**

Open `apps/web/src/app/canvas/page.tsx`.

Add imports at the top:

```typescript
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";

import type { ImageArtifact } from "@loomic/shared";
import { useAuth } from "../../lib/auth-context";
import { CanvasEditor } from "../../components/canvas-editor";
import { ChatSidebar } from "../../components/chat-sidebar";
import { fetchCanvas, ApiAuthError } from "../../lib/server-api";
import { insertImageOnCanvas } from "../../lib/canvas-elements";
```

In the `CanvasPageContent` component body (after the existing state declarations, around line 27), add the ExcalidrawAPI ref:

```typescript
const excalidrawApiRef = useRef<any>(null);

const handleApiReady = useCallback((api: any) => {
  excalidrawApiRef.current = api;
}, []);

const handleImageGenerated = useCallback((artifact: ImageArtifact) => {
  const api = excalidrawApiRef.current;
  if (!api) return;
  insertImageOnCanvas(api, artifact).catch((err) => {
    console.warn("Failed to insert image on canvas:", err);
  });
}, []);
```

Update the JSX where `CanvasEditor` is rendered (around line 92-96):

```typescript
<CanvasEditor
  canvasId={canvasData.id}
  accessToken={accessToken}
  initialContent={canvasData.content}
  onApiReady={handleApiReady}
/>
```

Update the JSX where `ChatSidebar` is rendered (around line 98-103):

```typescript
<ChatSidebar
  accessToken={accessToken}
  canvasId={canvasData.id}
  open={chatOpen}
  onToggle={() => setChatOpen(!chatOpen)}
  onImageGenerated={handleImageGenerated}
/>
```

- [ ] **Step 2: Verify web app compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/canvas/page.tsx
git commit -m "feat: bridge ExcalidrawAPI and chat sidebar for image-to-canvas pipeline"
```

---

### Task 8: Run full test suite and verify

**Files:**
- No new files

- [ ] **Step 1: Run server tests**

Run: `cd apps/server && npx vitest run`
Expected: All tests PASS. The new stream-adapter tests validate artifact extraction. Existing `mock-runs.test.ts` and `deep-agent-runtime.test.ts` tests should be unaffected because `expect.objectContaining` tolerates the new optional field.

- [ ] **Step 2: Run shared package type check**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run web type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit all if any uncommitted changes remain**

```bash
git status
# If clean, skip. Otherwise:
git add -A
git commit -m "chore: finalize image-to-canvas pipeline"
```
