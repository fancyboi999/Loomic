# Synchronous Tool Await for Image Generation Jobs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `generate_image` tool block until the PGMQ job completes, returning real results (signed_url or error) to the model — instead of immediately returning a jobId.

**Architecture:** The tool submits the job to PGMQ (unchanged), then polls `background_jobs` via an admin client until it reaches a terminal state (`succeeded`/`failed`/`dead_letter`/`canceled`). The tool returns the real result to the model. Client-side `job.submitted` SSE event and `useJobPolling` are removed since the model now handles the full lifecycle. The `tool.completed` event carries the image artifact directly (like the non-job path already does).

**Tech Stack:** TypeScript, Vitest, Supabase admin client, PGMQ

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/server/src/features/jobs/job-service.ts` | Modify | Add `getJobAdmin(jobId)` method (admin client, no RLS) |
| `apps/server/src/agent/tools/image-generate.ts` | Modify | Replace fire-and-forget with submit + poll-until-done |
| `apps/server/src/agent/runtime.ts` | Modify | Build and pass `getJobAdmin` into the tool deps |
| `apps/server/src/agent/deep-agent.ts` | Modify | Thread `getJobAdmin` through to tool/subagent creation |
| `apps/server/src/agent/sub-agents.ts` | Modify | Thread `getJobAdmin` through deps |
| `apps/server/src/agent/tools/index.ts` | Modify | Thread `getJobAdmin` through deps (if applicable) |
| `apps/server/src/agent/stream-adapter.ts` | Modify | Remove `job.submitted` event emission, remove `extractJobSubmission` |
| `packages/shared/src/events.ts` | Modify | Remove `jobSubmittedEventSchema` from discriminated union |
| `apps/web/src/hooks/use-job-polling.ts` | Delete | No longer needed |
| `apps/web/src/app/canvas/page.tsx` | Modify | Remove job polling integration, image placement now via tool artifact |
| `apps/server/test/image-generate-tool.test.ts` | Modify | Add tests for poll-until-done behavior |
| `apps/server/test/stream-adapter.test.ts` | Modify | Remove job.submitted test cases |

---

### Task 1: Add `getJobAdmin` to JobService

**Files:**
- Modify: `apps/server/src/features/jobs/job-service.ts`
- Test: `apps/server/test/image-generate-tool.test.ts` (will test indirectly via Task 2)

- [ ] **Step 1: Add `getJobAdmin` to the `JobService` type**

In `apps/server/src/features/jobs/job-service.ts`, add to the `JobService` type definition:

```typescript
// Add to the JobService type (after cancelJob):
getJobAdmin(jobId: string): Promise<BackgroundJob>;
```

- [ ] **Step 2: Implement `getJobAdmin` in `createJobService`**

Add the implementation inside `createJobService`'s return object, after the `cancelJob` method and before the worker-only methods:

```typescript
async getJobAdmin(jobId) {
  const admin = options.getAdminClient();
  const { data: job, error } = await admin
    .from("background_jobs")
    .select(SELECT_COLS)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new JobServiceError("job_query_failed", "Failed to query job.", 500);
  }
  if (!job) {
    throw new JobServiceError("job_not_found", "Job not found.", 404);
  }
  return mapJobRow(job as unknown as Record<string, unknown>);
},
```

- [ ] **Step 3: Run type check**

Run: `cd apps/server && npx tsc --noEmit`
Expected: PASS (new method added, not yet consumed)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/features/jobs/job-service.ts
git commit -m "feat(jobs): add getJobAdmin for admin-level job polling"
```

---

### Task 2: Rewrite `SubmitImageJobFn` to submit-and-await

**Files:**
- Modify: `apps/server/src/agent/tools/image-generate.ts`
- Test: `apps/server/test/image-generate-tool.test.ts`

- [ ] **Step 1: Write the failing test for poll-until-done**

Add to `apps/server/test/image-generate-tool.test.ts`:

```typescript
import type { BackgroundJob } from "@loomic/shared";

describe("generate_image tool with submitAndAwaitJob", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("polls until job succeeds and returns signed_url", async () => {
    let pollCount = 0;
    const submitAndAwaitJob = async (input: {
      prompt: string;
      title: string;
      model: string;
      aspectRatio: string;
    }) => ({
      jobId: "job-123",
      imageUrl: "https://storage.example.com/signed-url.png",
      width: 1024,
      height: 1024,
      mimeType: "image/png",
    });

    const result = await runImageGenerate(
      {
        title: "A cute cat",
        prompt: "a cat",
        model: "google/nano-banana-pro",
        aspectRatio: "1:1",
        placementWidth: 512,
        placementHeight: 512,
      },
      undefined,
      submitAndAwaitJob,
    );

    expect(result.imageUrl).toBe("https://storage.example.com/signed-url.png");
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
    expect(result.error).toBeUndefined();
    expect(result.summary).toContain("Generated image");
  });

  it("returns error when job fails", async () => {
    const submitAndAwaitJob = async () => ({
      jobId: "job-456",
      error: "Model overloaded",
    });

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test",
        model: "google/nano-banana-pro",
        aspectRatio: "1:1",
        placementWidth: 512,
        placementHeight: 512,
      },
      undefined,
      submitAndAwaitJob,
    );

    expect(result.error).toBe("Model overloaded");
    expect(result.summary).toContain("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && npx vitest run test/image-generate-tool.test.ts`
Expected: FAIL — the current `SubmitImageJobFn` returns `{ jobId }` not the full result

- [ ] **Step 3: Rewrite `SubmitImageJobFn` type and `runImageGenerate` logic**

In `apps/server/src/agent/tools/image-generate.ts`:

Replace the `SubmitImageJobFn` type:

```typescript
/**
 * Submit an image generation job and wait for it to complete.
 * Returns the final result: signed_url on success, error on failure.
 */
export type SubmitImageJobFn = (input: {
  prompt: string;
  title: string;
  model: string;
  aspectRatio: string;
  inputImages?: string[];
}) => Promise<{
  jobId: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  mimeType?: string;
  error?: string;
}>;
```

Replace the `submitImageJob` branch in `runImageGenerate`:

```typescript
// Job mode: submit to PGMQ and wait for worker to complete
if (submitImageJob) {
  try {
    const jobResult = await submitImageJob({
      prompt: input.prompt,
      title: input.title,
      model: input.model,
      aspectRatio: input.aspectRatio ?? "1:1",
      ...(input.inputImages ? { inputImages: input.inputImages } : {}),
    });

    if (jobResult.error) {
      return {
        summary: `Image generation failed: ${jobResult.error}`,
        error: jobResult.error,
      };
    }

    const result: ImageGenerateResult = {
      summary: `Generated image (${jobResult.width ?? 0}x${jobResult.height ?? 0}) via replicate/${input.model}`,
      title: input.title,
      imageUrl: jobResult.imageUrl ?? "",
      mimeType: jobResult.mimeType ?? "image/png",
      width: jobResult.width,
      height: jobResult.height,
    };
    if (input.placementX != null && input.placementY != null) {
      result.placement = {
        x: input.placementX,
        y: input.placementY,
        width: input.placementWidth ?? 512,
        height: input.placementHeight ?? 512,
      };
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      summary: `Image generation failed: ${message}`,
      error: message,
    };
  }
}
```

Also remove `jobId` and `model` from `ImageGenerateResult` type (no longer returned to model):

```typescript
type ImageGenerateResult = {
  summary: string;
  title?: string;
  imageUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  error?: string;
  placement?: { x: number; y: number; width: number; height: number };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run test/image-generate-tool.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/tools/image-generate.ts apps/server/test/image-generate-tool.test.ts
git commit -m "feat(tools): rewrite SubmitImageJobFn to submit-and-await pattern"
```

---

### Task 3: Build `submitAndAwaitJob` closure in runtime.ts

**Files:**
- Modify: `apps/server/src/agent/runtime.ts`
- Modify: `apps/server/src/features/jobs/job-service.ts` (add `getJobAdmin` to type — done in Task 1)

The closure in `runtime.ts` currently creates the job and returns `{ jobId }` immediately. We need it to:
1. Create the job (unchanged)
2. Poll `jobService.getJobAdmin(jobId)` until terminal state
3. Return the full result

- [ ] **Step 1: Rewrite the `submitImageJob` closure in `runtime.ts`**

Replace lines ~190-231 in `apps/server/src/agent/runtime.ts` (the `submitImageJob` closure):

```typescript
// Build submitAndAwaitJob closure: submits PGMQ job, polls until completion
let submitImageJob: SubmitImageJobFn | undefined;
if (options.jobService && options.createUserClient && run.accessToken && run.userId) {
  const jobSvc = options.jobService;
  const createClient = options.createUserClient;
  const accessToken = run.accessToken;
  const userId = run.userId;
  const canvasId = run.canvasId;

  submitImageJob = async (input) => {
    // Look up personal workspace
    const client = createClient(accessToken) as UserSupabaseClient;
    const { data: ws } = await client
      .from("workspaces")
      .select("id")
      .eq("type", "personal")
      .limit(1)
      .single();
    if (!ws?.id) throw new Error("No personal workspace found");

    const user: AuthenticatedUser = {
      id: userId,
      accessToken,
      email: "",
      userMetadata: {},
    };
    const job = await jobSvc.createJob(user, {
      workspaceId: ws.id,
      ...(canvasId ? { canvasId } : {}),
      jobType: "image_generation",
      payload: {
        prompt: input.prompt,
        title: input.title,
        model: input.model,
        aspect_ratio: input.aspectRatio,
        ...(input.inputImages ? { input_images: input.inputImages } : {}),
      },
    });

    // Poll until terminal state
    const POLL_INTERVAL = 2000;
    const MAX_WAIT = 120_000; // 2 minutes
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT) {
      await delay(POLL_INTERVAL);

      if (run.controller.signal.aborted) {
        throw new Error("Run was canceled");
      }

      const current = await jobSvc.getJobAdmin(job.id);

      if (current.status === "succeeded" && current.result) {
        const result = current.result as {
          signed_url?: string;
          width?: number;
          height?: number;
          mime_type?: string;
        };
        return {
          jobId: job.id,
          imageUrl: result.signed_url ?? "",
          width: result.width ?? 1024,
          height: result.height ?? 1024,
          mimeType: result.mime_type ?? "image/png",
        };
      }

      if (current.status === "dead_letter" || current.status === "canceled") {
        return {
          jobId: job.id,
          error: current.error_message ?? `Job ${current.status}`,
        };
      }

      // "failed" with attempts remaining means worker will retry — keep polling
      if (
        current.status === "failed" &&
        current.attempt_count >= current.max_attempts
      ) {
        return {
          jobId: job.id,
          error: current.error_message ?? "Job failed after max retries",
        };
      }
    }

    return {
      jobId: job.id,
      error: `Job timed out after ${MAX_WAIT / 1000}s`,
    };
  };
}
```

Note: `delay` is already imported at line 2: `import { setTimeout as delay } from "node:timers/promises";`

- [ ] **Step 2: Run type check**

Run: `cd apps/server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/runtime.ts
git commit -m "feat(runtime): submit-and-await closure polls job until completion"
```

---

### Task 4: Remove `job.submitted` from stream-adapter and shared events

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts`
- Modify: `packages/shared/src/events.ts`
- Modify: `apps/server/test/stream-adapter.test.ts`

Since the tool now blocks until completion, by the time `on_tool_end` fires, the output already has the real `imageUrl` — no more `jobId`-only responses. The `job.submitted` SSE event is dead code.

- [ ] **Step 1: Remove `extractJobSubmission` and its usage in `stream-adapter.ts`**

In `apps/server/src/agent/stream-adapter.ts`:

1. Remove the `extractJobSubmission` function (lines 471-503)
2. In the `on_tool_end` handler (around line 159-203), remove lines 170-182 (the `jobInfo` block):

```typescript
// REMOVE these lines:
const jobInfo = extractJobSubmission(output);
if (jobInfo) {
  yield { ... job.submitted ... };
}
```

3. Update the `isInnerSubAgentTool` line — remove `|| jobInfo` from the condition:

```typescript
// Before:
const extractedArtifacts = (isInnerSubAgentTool || jobInfo) ? undefined : extractArtifacts(output);
// After:
const extractedArtifacts = isInnerSubAgentTool ? undefined : extractArtifacts(output);
```

4. Remove `jobId` from the `ARTIFACT_KEYS` set (line 268) — it's no longer an artifact field.

- [ ] **Step 2: Remove `jobSubmittedEventSchema` from `packages/shared/src/events.ts`**

1. Remove the `jobSubmittedEventSchema` definition (lines 72-81)
2. Remove it from the `streamEventSchema` discriminated union (line 91)
3. Remove the `placementSchema` import if it was only used by `jobSubmittedEventSchema` — check other usages first. (It's also exported and used by `toolArtifactSchema`, so keep it.)

- [ ] **Step 3: Update stream-adapter tests**

In `apps/server/test/stream-adapter.test.ts`, remove any test cases that assert `job.submitted` events. These tests will fail since the event type no longer exists in the schema.

- [ ] **Step 4: Run tests**

Run: `cd apps/server && npx vitest run test/stream-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Run full type check**

Run: `cd apps/server && npx tsc --noEmit && cd ../../packages/shared && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts packages/shared/src/events.ts apps/server/test/stream-adapter.test.ts
git commit -m "refactor: remove job.submitted event — tool now awaits job completion"
```

---

### Task 5: Remove client-side job polling

**Files:**
- Delete: `apps/web/src/hooks/use-job-polling.ts`
- Modify: `apps/web/src/app/canvas/page.tsx`
- Modify: `apps/web/src/lib/server-api.ts` (if `fetchJob` is only used by polling)

The image now arrives as a `tool.completed` artifact with a real `imageUrl`. The existing `ChatSidebar` → SSE event handler → `insertImageOnCanvas` flow via tool artifacts should handle placement. We need to verify this path works.

- [ ] **Step 1: Remove `useJobPolling` hook file**

Delete `apps/web/src/hooks/use-job-polling.ts`.

- [ ] **Step 2: Clean up `canvas/page.tsx`**

In `apps/web/src/app/canvas/page.tsx`:

1. Remove the `useJobPolling` import and `PendingJob` import
2. Remove the `useJobPolling(accessToken ?? "")` call
3. Remove the `onJobSubmitted` callback that calls `addJob`
4. Remove the `useEffect` that processes `completedJobs` → `insertImageOnCanvas`
5. Remove `CanvasGeneratingOverlay` import and usage if it was for pending jobs
6. Remove `pendingJobs`, `addJob`, `completedJobs`, `clearCompletedJob` references

The `handleToolArtifact` or existing tool-completed handler in `ChatSidebar` already handles image artifacts from `tool.completed` events. Verify this by checking how `ChatSidebar` handles tool artifacts.

- [ ] **Step 3: Check that ChatSidebar handles image placement from tool artifacts**

Read `apps/web/src/components/chat-sidebar.tsx` and verify that when a `tool.completed` event includes artifacts with `placement` data, it calls `insertImageOnCanvas`. If this path doesn't exist yet, it needs to be wired up — the image URL + placement is now in `tool.completed.artifacts[0]` instead of coming from job polling.

If missing, add an `onToolArtifact` callback prop to `ChatSidebar` that `canvas/page.tsx` handles to call `insertImageOnCanvas`.

- [ ] **Step 4: Remove `fetchJob` from `server-api.ts` if unused**

Check if `fetchJob` in `apps/web/src/lib/server-api.ts` is used anywhere besides `use-job-polling.ts`. If not, remove it.

- [ ] **Step 5: Run type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove client-side job polling — images arrive via tool artifacts"
```

---

### Task 6: Wire image-on-canvas placement from tool artifacts

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx` (if not already handling artifact placement)
- Modify: `apps/web/src/app/canvas/page.tsx`

This task ensures that when a `tool.completed` event arrives with an image artifact + placement, the image gets placed on the canvas. This replaces the old job-polling → `insertImageOnCanvas` path.

- [ ] **Step 1: Check existing artifact handling in ChatSidebar**

Read `apps/web/src/components/chat-sidebar.tsx` and search for how `tool.completed` artifacts are surfaced. If `ChatSidebar` already exposes an `onToolArtifact` or `onImageGenerated` callback, skip to wiring it up in `page.tsx`.

- [ ] **Step 2: Add `onImageArtifact` callback if missing**

If `ChatSidebar` doesn't surface image artifacts, add a prop:

```typescript
onImageArtifact?: (artifact: { url: string; title?: string; placement?: { x: number; y: number; width: number; height: number } }) => void;
```

Call it from the SSE event handler when a `tool.completed` event has artifacts with type `"image"`.

- [ ] **Step 3: Handle `onImageArtifact` in `canvas/page.tsx`**

```typescript
const handleImageArtifact = useCallback((artifact: {
  url: string;
  title?: string;
  placement?: { x: number; y: number; width: number; height: number };
}) => {
  const api = excalidrawApiRef.current;
  if (!api || !artifact.url) return;
  insertImageOnCanvas(api, artifact.url, {
    x: artifact.placement?.x ?? 0,
    y: artifact.placement?.y ?? 0,
    width: artifact.placement?.width ?? 512,
    height: artifact.placement?.height ?? 512,
  });
}, []);
```

Pass to `<ChatSidebar onImageArtifact={handleImageArtifact} />`.

- [ ] **Step 4: Run type check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx apps/web/src/app/canvas/page.tsx
git commit -m "feat: wire image artifact placement from tool.completed to canvas"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run all server tests**

Run: `cd apps/server && npx vitest run`
Expected: PASS

- [ ] **Step 2: Run full monorepo type check**

Run: `pnpm -r run typecheck` or `npx tsc --noEmit` in each package
Expected: PASS

- [ ] **Step 3: Manual E2E test**

1. Start `pnpm dev`
2. Open canvas, trigger "generate an image of a sunset"
3. Verify: chatbar shows `✓ 生成图片` with card → "查看详情" shows real URL
4. Verify: image appears on canvas at the correct placement coordinates
5. Verify: no `job.submitted` events in browser DevTools Network tab (SSE stream)
6. Verify: no client-side polling requests to `/api/jobs/:id`

- [ ] **Step 4: Commit any fixes from E2E testing**
