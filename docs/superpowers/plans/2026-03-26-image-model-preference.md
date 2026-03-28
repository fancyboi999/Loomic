# Image Model Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose their preferred image generation model (Auto = agent picks, Manual = locked to user's choice), surfaced via popover on Home page and Chat sidebar, with backend enforcing the preference in the `generate_image` tool schema.

**Architecture:** Frontend stores preference in localStorage via a custom hook. When creating a run, the preferred image model (if manual mode) is sent in the request payload. Server threads it through runtime → agent factory → tool creation, where it locks the tool's model enum to the single chosen model. A new `/api/image-models` endpoint exposes available image models from the provider registry.

**Tech Stack:** React (hooks, popover), Zod (schema), Fastify (endpoint), localStorage, existing Loomic UI patterns (black/white minimal aesthetic).

---

### Task 1: Backend — Image Models API Endpoint

**Files:**
- Create: `apps/server/src/http/image-models.ts`
- Modify: `apps/server/src/app.ts` (register route)
- Modify: `apps/web/src/lib/server-api.ts` (add fetch function)

- [ ] **Step 1: Create image-models route**

```typescript
// apps/server/src/http/image-models.ts
import type { FastifyInstance } from "fastify";
import { getAvailableImageModels } from "../generation/providers/registry.js";

export async function registerImageModelRoutes(app: FastifyInstance) {
  app.get("/api/image-models", async (_request, reply) => {
    const models = getAvailableImageModels();
    return reply.code(200).send({ models });
  });
}
```

- [ ] **Step 2: Register route in app.ts**

In `apps/server/src/app.ts`, add import and registration after the existing `registerModelRoutes`:

```typescript
import { registerImageModelRoutes } from "./http/image-models.js";
// ... in buildApp():
void registerImageModelRoutes(app);
```

- [ ] **Step 3: Add frontend fetch function**

In `apps/web/src/lib/server-api.ts`, add:

```typescript
export type ImageModelInfo = {
  id: string;
  displayName: string;
  description: string;
  provider: string;
};

export async function fetchImageModels(): Promise<{ models: ImageModelInfo[] }> {
  const response = await fetch(`${getServerBaseUrl()}/api/image-models`);
  if (!response.ok) {
    throw new Error(`Failed to fetch image models: ${response.status}`);
  }
  return (await response.json()) as { models: ImageModelInfo[] };
}
```

- [ ] **Step 4: Verify endpoint works**

Run: `pnpm --filter server exec vitest run test/generation/replicate-image.test.ts`
Start dev server and test: `curl http://localhost:3001/api/image-models`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/image-models.ts apps/server/src/app.ts apps/web/src/lib/server-api.ts
git commit -m "feat: add /api/image-models endpoint for image generation model discovery"
```

---

### Task 2: Shared Contract — Extend Run Create Request

**Files:**
- Modify: `packages/shared/src/contracts.ts` (line 34-40)

- [ ] **Step 1: Add imageModel field to runCreateRequestSchema**

In `packages/shared/src/contracts.ts`, modify `runCreateRequestSchema`:

```typescript
export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string(),
  canvasId: canvasIdSchema.optional(),
  attachments: z.array(imageAttachmentSchema).optional(),
  imageModel: z.string().optional(),
});
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `pnpm --filter server exec vitest run`
The new optional field should not break any existing tests.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/contracts.ts
git commit -m "feat: add optional imageModel field to run create request schema"
```

---

### Task 3: Backend — Thread imageModel Through Runtime to Tools

**Files:**
- Modify: `apps/server/src/http/runs.ts` (lines 78-84)
- Modify: `apps/server/src/agent/runtime.ts` (lines 34-43, 96-120, 288-365)
- Modify: `apps/server/src/agent/deep-agent.ts` (lines 31-42, 74-87)
- Modify: `apps/server/src/agent/tools/index.ts` (lines 20-42)
- Modify: `apps/server/src/agent/sub-agents.ts` (lines 26-47)
- Modify: `apps/server/src/agent/tools/image-generate.ts` (lines 233-259)

- [ ] **Step 1: Extract imageModel in runs.ts**

In `apps/server/src/http/runs.ts`, modify the `createRun` call (around line 78) to pass `imageModel` from the parsed payload:

```typescript
const response = runCreateResponseSchema.parse(
  agentRuns.createRun(payload, {
    ...(authenticatedUser ? { accessToken: authenticatedUser.accessToken, userId: authenticatedUser.id } : {}),
    ...(model ? { model } : {}),
    ...(payload.imageModel ? { imageModel: payload.imageModel } : {}),
    ...(sessionThread ? { threadId: sessionThread.threadId } : {}),
  }),
);
```

- [ ] **Step 2: Add imageModel to RuntimeRunRecord and createRun in runtime.ts**

In `apps/server/src/agent/runtime.ts`:

Update `RuntimeRunRecord` type (around line 34):
```typescript
type RuntimeRunRecord = RunCreateRequest & {
  accessToken?: string;
  consumed: boolean;
  controller: AbortController;
  modelOverride?: string;
  imageModel?: string;
  runId: string;
  status: RuntimeRunStatus;
  threadId?: string;
  userId?: string;
};
```

Update `createRun` method signature and body to accept and store `imageModel` (around line 96):
```typescript
createRun(
  input: RunCreateRequest,
  runOptions?: { accessToken?: string; model?: string; imageModel?: string; threadId?: string; userId?: string },
): RunCreateResponse {
  // ... existing code ...
  runs.set(runId, {
    ...input,
    ...(runOptions?.accessToken ? { accessToken: runOptions.accessToken } : {}),
    consumed: false,
    controller: new AbortController(),
    ...(runOptions?.model ? { modelOverride: runOptions.model } : {}),
    ...(runOptions?.imageModel ? { imageModel: runOptions.imageModel } : {}),
    ...(runOptions?.threadId ? { threadId: runOptions.threadId } : {}),
    ...(runOptions?.userId ? { userId: runOptions.userId } : {}),
    runId,
    status: "accepted",
  });
  // ... rest unchanged ...
}
```

Update `streamRun` to pass `imageModel` to agent factory (around line 356, in the `resolvedAgentFactory` call):
```typescript
agent = resolvedAgentFactory({
  ...(submitImageJob ? { submitImageJob } : {}),
  env: options.env,
  ...(resolvedModel ? { model: resolvedModel } : {}),
  ...(run.imageModel ? { imageModel: run.imageModel } : {}),
  // ... rest of existing options ...
});
```

- [ ] **Step 3: Accept imageModel in deep-agent.ts**

In `apps/server/src/agent/deep-agent.ts`, add `imageModel` to options:

```typescript
export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  brandKitId?: string | null;
  canvasId?: string;
  checkpointer?: BaseCheckpointSaver;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  imageModel?: string;
  model?: BaseLanguageModel | string;
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  store?: BaseStore;
}): LoomicAgent
```

Pass to sub-agents and tools (around line 74):
```typescript
subagents: [
  createImageSubAgent({
    ...(options.persistImage ? { persistImage: options.persistImage } : {}),
    ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
    ...(options.imageModel ? { preferredImageModel: options.imageModel } : {}),
  }),
  createVideoSubAgent(),
],
```

And tools (around line 82):
```typescript
tools: createMainAgentTools(backendFactory, {
  createUserClient,
  ...(options.brandKitId != null ? { brandKitId: options.brandKitId } : {}),
  ...(options.persistImage ? { persistImage: options.persistImage } : {}),
  ...(options.submitImageJob ? { submitImageJob: options.submitImageJob } : {}),
  ...(options.imageModel ? { preferredImageModel: options.imageModel } : {}),
}),
```

- [ ] **Step 4: Thread through tools/index.ts**

In `apps/server/src/agent/tools/index.ts`, add `preferredImageModel` to deps:

```typescript
export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
    persistImage?: PersistImageFn;
    submitImageJob?: SubmitImageJobFn;
    preferredImageModel?: string;
  },
) {
  const tools: StructuredTool[] = [
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps),
    createManipulateCanvasTool(deps),
    createImageGenerateTool({
      ...(deps.persistImage ? { persistImage: deps.persistImage } : {}),
      ...(deps.submitImageJob ? { submitImageJob: deps.submitImageJob } : {}),
      ...(deps.preferredImageModel ? { preferredImageModel: deps.preferredImageModel } : {}),
    }),
  ];
  // ... rest unchanged ...
}
```

- [ ] **Step 5: Thread through sub-agents.ts**

In `apps/server/src/agent/sub-agents.ts`:

```typescript
export function createImageSubAgent(deps?: {
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  preferredImageModel?: string;
}): SubAgent {
  // ... existing systemPrompt, etc. ...
  return {
    // ... existing fields ...
    tools: [createImageGenerateTool(deps)],
  };
}
```

- [ ] **Step 6: Lock model in image-generate.ts tool factory**

In `apps/server/src/agent/tools/image-generate.ts`, update `createImageGenerateTool`:

```typescript
export function createImageGenerateTool(deps?: {
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
  availableModels?: AvailableModel[];
  preferredImageModel?: string;
}) {
  const allModels = deps?.availableModels ?? getAvailableImageModels();

  // If user selected a specific model (manual mode), lock the schema to only that model
  const models = deps?.preferredImageModel
    ? allModels.filter((m) => m.id === deps.preferredImageModel).length > 0
      ? allModels.filter((m) => m.id === deps.preferredImageModel)
      : allModels // fallback to all if preferred model not found in registry
    : allModels;

  const modelSummary = models.length
    ? models.map((m) => `${m.displayName} (${m.id})`).join(", ")
    : "No models available";

  return tool(
    async (input: ImageGenerateInput) => {
      return await runImageGenerate(
        input,
        deps?.persistImage,
        deps?.submitImageJob,
      );
    },
    {
      name: "generate_image",
      description: `Generate an image using AI. Available models: ${modelSummary}. Returns the generated image URL.`,
      schema: buildImageGenerateSchema(models),
    },
  );
}
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter server exec vitest run test/image-generate-tool.test.ts test/generation/replicate-image.test.ts test/tools-index.test.ts test/sub-agents.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/http/runs.ts apps/server/src/agent/runtime.ts apps/server/src/agent/deep-agent.ts apps/server/src/agent/tools/index.ts apps/server/src/agent/sub-agents.ts apps/server/src/agent/tools/image-generate.ts
git commit -m "feat: thread imageModel preference from run payload through to generate_image tool schema"
```

---

### Task 4: Frontend — useImageModelPreference Hook

**Files:**
- Create: `apps/web/src/hooks/use-image-model-preference.ts`

- [ ] **Step 1: Create the hook**

```typescript
// apps/web/src/hooks/use-image-model-preference.ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "loomic:image-model-preference";
const DEFAULT_MODEL = "black-forest-labs/flux-kontext-pro";

export type ImageModelPreference = {
  mode: "auto" | "manual";
  model: string;
};

const defaultPreference: ImageModelPreference = {
  mode: "auto",
  model: DEFAULT_MODEL,
};

// Listeners for cross-component reactivity
const listeners = new Set<() => void>();
function emitChange() {
  for (const listener of listeners) listener();
}

function getSnapshot(): ImageModelPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreference;
    return JSON.parse(raw) as ImageModelPreference;
  } catch {
    return defaultPreference;
  }
}

function getServerSnapshot(): ImageModelPreference {
  return defaultPreference;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useImageModelPreference() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPreference = useCallback((next: ImageModelPreference) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitChange();
  }, []);

  const setMode = useCallback(
    (mode: "auto" | "manual") => {
      setPreference({ ...preference, mode });
    },
    [preference, setPreference],
  );

  const setModel = useCallback(
    (model: string) => {
      setPreference({ mode: "manual", model });
    },
    [setPreference],
  );

  /** Returns the model ID to send in the run payload, or undefined for auto mode. */
  const activeImageModel = preference.mode === "manual" ? preference.model : undefined;

  return { preference, setPreference, setMode, setModel, activeImageModel };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/use-image-model-preference.ts
git commit -m "feat: add useImageModelPreference hook with localStorage persistence"
```

---

### Task 5: Frontend — ImageModelPreferencePopover Component

**Files:**
- Create: `apps/web/src/components/image-model-preference.tsx`

- [ ] **Step 1: Create the popover component**

```tsx
// apps/web/src/components/image-model-preference.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import type { ImageModelInfo } from "../lib/server-api";
import { fetchImageModels } from "../lib/server-api";
import { useImageModelPreference } from "../hooks/use-image-model-preference";

export function ImageModelPreferencePopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { preference, setMode, setModel } = useImageModelPreference();
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchImageModels()
      .then((data) => setModels(data.models))
      .catch(() => {});
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 z-50 mb-2 w-[340px] rounded-xl border-[0.5px] border-[#E3E3E3] bg-white p-1 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
    >
      <div className="flex flex-col gap-3 py-2">
        {/* Header */}
        <div className="flex items-center justify-between px-3">
          <span className="text-sm font-semibold text-[#2F3640]">
            Image Model
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#4a535f]">Auto</span>
            <button
              type="button"
              onClick={() =>
                setMode(preference.mode === "auto" ? "manual" : "auto")
              }
              className={`relative h-4 w-[30px] rounded-full transition-colors ${
                preference.mode === "auto" ? "bg-[#2F3640]" : "bg-[#D1D5DB]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                  preference.mode === "auto"
                    ? "translate-x-[15px]"
                    : "translate-x-[3px]"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Model list */}
        <div className="scrollbar-hidden max-h-[300px] space-y-0.5 overflow-y-auto px-1">
          {models.map((m) => {
            const selected =
              preference.mode === "manual" && preference.model === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#F2F3F5] ${
                  selected ? "bg-[#F2F3F5]" : ""
                }`}
              >
                <div className="flex flex-1 flex-col">
                  <span className="text-[13px] font-medium text-[#2F3640]">
                    {m.displayName}
                  </span>
                  <span className="text-[11px] leading-tight text-[#4A535F]">
                    {m.description}
                  </span>
                </div>
                {selected && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0 text-[#2F3640]"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.08 3.087a.583.583 0 0 1 0 .825L5.661 10.33a.583.583 0 0 1-.824 0L1.92 7.412a.583.583 0 0 1 .825-.825L5.25 9.092l6.004-6.005a.583.583 0 0 1 .825 0"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/image-model-preference.tsx
git commit -m "feat: add ImageModelPreferencePopover component with auto/manual mode toggle"
```

---

### Task 6: Frontend — Wire into Home Page (Agent Button)

**Files:**
- Modify: `apps/web/src/components/home-prompt.tsx` (lines 50-54, 209-230)

- [ ] **Step 1: Add model preference popover to HomePrompt**

In `apps/web/src/components/home-prompt.tsx`:

Add imports at the top:
```typescript
import { ImageModelPreferencePopover } from "./image-model-preference";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
```

Inside the component, add state and ref:
```typescript
const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
const agentBtnRef = useRef<HTMLButtonElement>(null);
const { preference } = useImageModelPreference();
```

Find the toolbar buttons rendering loop (around line 209-230). Replace the Agent button rendering so it's enabled and toggles the popover. The Agent button is at index 4 in `toolbarButtons`. Modify its rendering:

Instead of rendering it disabled, render it as an active button that opens the popover:
```tsx
{toolbarButtons.map((btn, i) => {
  // Special handling for Agent button (index 4)
  if (i === 4) {
    return (
      <div key={btn.label} className="relative">
        <button
          ref={agentBtnRef}
          type="button"
          onClick={() => setModelPopoverOpen((prev) => !prev)}
          title={btn.label}
          className={`flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] transition-colors ${
            preference.mode === "manual"
              ? "border-[#363636] bg-[#363636] text-white"
              : "border-[#C4C4C4] text-[#363636] hover:bg-black/[0.04]"
          }`}
        >
          {btn.icon}
        </button>
        <ImageModelPreferencePopover
          open={modelPopoverOpen}
          onClose={() => setModelPopoverOpen(false)}
          anchorRef={agentBtnRef}
        />
      </div>
    );
  }
  // ... existing disabled button rendering for other buttons ...
})}
```

- [ ] **Step 2: Verify visually**

Start dev: `pnpm dev`
Navigate to Home page, click the Agent button, verify popover opens with model list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/home-prompt.tsx
git commit -m "feat: wire ImageModelPreferencePopover to Agent button on Home page"
```

---

### Task 7: Frontend — Wire into Chat Sidebar + Pass to createRun

**Files:**
- Modify: `apps/web/src/components/chat-input.tsx` (add model preference button)
- Modify: `apps/web/src/components/chat-sidebar.tsx` (pass imageModel in run payload)

- [ ] **Step 1: Add model preference button to ChatInput**

In `apps/web/src/components/chat-input.tsx`:

Add imports:
```typescript
import { ImageModelPreferencePopover } from "./image-model-preference";
import { useImageModelPreference } from "../hooks/use-image-model-preference";
```

Inside the component, add state and ref:
```typescript
const { preference } = useImageModelPreference();
const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
const modelBtnRef = useRef<HTMLButtonElement>(null);
```

In the toolbar area (the `<div className="flex items-center">` around line 130), add the model preference button next to the attach button:

```tsx
<div className="flex items-center">
  {/* Existing attach button */}
  {onAddFiles && (
    <>
      {/* ... existing file input and attach button ... */}
    </>
  )}
  {/* Model preference button */}
  <div className="relative">
    <button
      ref={modelBtnRef}
      type="button"
      onClick={() => setModelPopoverOpen((prev) => !prev)}
      title="Image model"
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        preference.mode === "manual"
          ? "bg-[#0C0C0D] text-white"
          : "text-[#A4A9B2] hover:bg-black/[0.04] hover:text-[#525252]"
      }`}
    >
      <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.8 1.307a2.33 2.33 0 0 1 2.4 0l7.67 4.602A2.33 2.33 0 0 1 22 7.907v8.361a2.33 2.33 0 0 1-1.13 1.998l-7.67 4.602-.141.078a2.33 2.33 0 0 1-2.258-.078l-7.67-4.602A2.33 2.33 0 0 1 2 16.268V7.907a2.33 2.33 0 0 1 1.003-1.915l.128-.083z" />
      </svg>
    </button>
    <ImageModelPreferencePopover
      open={modelPopoverOpen}
      onClose={() => setModelPopoverOpen(false)}
      anchorRef={modelBtnRef}
    />
  </div>
</div>
```

- [ ] **Step 2: Pass imageModel in ChatSidebar's createRun call**

In `apps/web/src/components/chat-sidebar.tsx`:

Add import at the top:
```typescript
import { useImageModelPreference } from "../hooks/use-image-model-preference";
```

Inside the `ChatSidebar` component, add:
```typescript
const { activeImageModel } = useImageModelPreference();
```

Modify the `createRun` call inside `handleSend` (around line 438-449) to include `imageModel`:
```typescript
const run = await createRun(
  {
    sessionId: currentSessionId,
    conversationId: canvasId,
    prompt: text,
    canvasId,
    ...(currentAttachments.length > 0 ? { attachments: currentAttachments } : {}),
    ...(activeImageModel ? { imageModel: activeImageModel } : {}),
  },
  {
    accessToken: accessTokenRef.current,
  },
);
```

- [ ] **Step 3: Also pass imageModel from Home page prompt submission**

In `apps/web/src/app/(workspace)/home/page.tsx`, modify the prompt submit flow to include `imageModel` when navigating to canvas. The `imageModel` will be picked up from localStorage by `ChatSidebar` when it creates the run, so **no change needed** in the home page flow — the preference is already in localStorage and ChatSidebar reads it.

- [ ] **Step 4: Verify end-to-end**

1. Start dev: `pnpm dev`
2. Open Home page → click Agent button → select a model in manual mode
3. Navigate to canvas → open chat → verify the model button shows manual mode (filled icon)
4. Send a message → verify server receives `imageModel` in the run payload (check server logs)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat-input.tsx apps/web/src/components/chat-sidebar.tsx
git commit -m "feat: wire image model preference into ChatInput button and ChatSidebar run payload"
```
