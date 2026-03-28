# Async Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图片生成从同步阻塞改为异步队列模式，对齐 Lovart 的交互体验：tool 提交任务即返回 → 画布显示占位图 + 进度动画 → Worker 异步生成 → 完成后前端替换真图。

**Architecture:** generate_image tool 不再直接调用 Replicate API，而是通过已有的 PGMQ + JobService 创建后台任务并立即返回 `{ jobId, status: "submitted" }`。Sub-agent 将 jobId + placement 返回主 agent，主 agent 回复用户"正在生成..."。Stream adapter 检测 jobId 模式，推送 `job.submitted` 事件。前端收到后在画布放置占位元素 + 显示进度动画条，同时轮询 `/api/jobs/:jobId` 直到完成，然后替换为真图。

**Tech Stack:** TypeScript, LangGraph/deepagents, PGMQ, Fastify SSE, React, Excalidraw API

**Why not LangGraph interrupt():** deepagentsjs issue #131 表明 GraphInterrupt 从 sub-agent tool 抛出时会丢失 interrupts 属性。Lovart 生产验证的模式是 fire-and-forget + frontend polling，更简单可靠。未来 deepagents 修复后可考虑 interrupt 增强。

---

## File Map

### Server — Modified
| File | Responsibility |
|------|---------------|
| `apps/server/src/agent/tools/image-generate.ts` | Tool 改为创建 background job 并立即返回 |
| `apps/server/src/agent/sub-agents.ts` | Response schema 支持 jobId（无 url 的异步模式） |
| `apps/server/src/agent/stream-adapter.ts` | 从 raw record 层检测 jobId，emit `job.submitted` 事件 |
| `apps/server/src/agent/runtime.ts` | 注入 `submitImageJob` 闭包（需构造 AuthenticatedUser + 查 workspaceId） |
| `apps/server/src/agent/deep-agent.ts` | 接收并传递 submitImageJob 到 sub-agent |
| `apps/server/src/app.ts` | 传递 jobService + viewerService 给 agentRunService |
| `apps/server/src/features/jobs/executors/image-generation.ts` | 修复：从 DB payload 列读取 prompt 而非 PGMQ 消息 |

### Shared — Modified
| File | Responsibility |
|------|---------------|
| `packages/shared/src/events.ts` | 新增 `job.submitted` 事件类型 |
| `packages/shared/src/artifacts.ts` | ImageArtifact 增加 jobId 字段 |

### Frontend — Modified
| File | Responsibility |
|------|---------------|
| `apps/web/src/components/chat-sidebar.tsx` | 处理 job.submitted 事件，触发 polling 和占位图 |
| `apps/web/src/components/chat-message.tsx` | 渲染生成进度条（模型名 + 计时器 + logo 动画） |
| `apps/web/src/app/canvas/page.tsx` | 管理 pending jobs 状态，协调占位图和真图替换 |
| `apps/web/src/lib/server-api.ts` | 新增 fetchJob() API |

### Frontend — New
| File | Responsibility |
|------|---------------|
| `apps/web/src/hooks/use-job-polling.ts` | Job 状态轮询 hook |
| `apps/web/src/components/canvas-generating-overlay.tsx` | 画布占位图 + "Generating" 动画覆层 |

---

## Task 1: Shared Contracts — 新增 job.submitted 事件和 artifact jobId

**Files:**
- Modify: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/artifacts.ts`

- [ ] **Step 1: 更新 ImageArtifact schema 支持 jobId**

```typescript
// packages/shared/src/artifacts.ts
// 在 imageArtifactSchema 中添加 jobId 字段
export const imageArtifactSchema = z.object({
  type: z.literal("image"),
  title: z.string().optional(),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema.optional(),
  jobId: z.string().optional(), // ← 新增：异步任务的 jobId
});
```

- [ ] **Step 2: 新增 job.submitted 事件类型**

```typescript
// packages/shared/src/events.ts
// 在现有 event schema 列表中新增：
export const jobSubmittedEventSchema = z.object({
  type: z.literal("job.submitted"),
  runId: z.string(),
  jobId: z.string(),
  jobType: z.string(),
  title: z.string().optional(),
  model: z.string().optional(),
  placement: placementSchema.optional(),
  timestamp: z.string(),
});

// 更新 streamEventSchema discriminatedUnion 加入 jobSubmittedEventSchema
```

注意：`placementSchema` 需要从 artifacts.ts 导入或在 events.ts 中引用。

- [ ] **Step 3: 重新 build shared 包验证类型**

Run: `cd packages/shared && pnpm build`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/events.ts packages/shared/src/artifacts.ts
git commit -m "feat(shared): add job.submitted event type and jobId to ImageArtifact"
```

---

## Task 2: Server — 修复 Worker executor 从 DB 读取 payload

**Files:**
- Modify: `apps/server/src/features/jobs/executors/image-generation.ts`

**Context:** 现有 executor 从 PGMQ 消息的 `rawPayload` 读取 `prompt`、`model` 等字段，但 `jobService.createJob` 只往 PGMQ 发送 `{ job_id, job_type, workspace_id }`，实际 payload 存在 `background_jobs.payload` 列中。这是一个 latent bug，当前从未被触发过因为 worker 路径未被实际使用。

- [ ] **Step 1: 修改 executor 从 DB payload 列读取参数**

```typescript
// apps/server/src/features/jobs/executors/image-generation.ts
registerExecutor("image_generation", async (jobId, _rawPayload, ctx: ExecutorContext) => {
  // Read the full job row to get payload + metadata
  const admin = ctx.getAdminClient();
  const { data: jobRow } = await admin
    .from("background_jobs")
    .select("created_by, workspace_id, payload")
    .eq("id", jobId)
    .single();

  if (!jobRow) throw new Error(`Job ${jobId} not found`);

  const payload = (jobRow.payload ?? {}) as {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
    title?: string;
    input_images?: string[];
  };

  const createdBy: string | null = jobRow.created_by ?? null;
  const workspaceId: string = jobRow.workspace_id ?? jobId;

  // ... 后续 generateImage 逻辑保持不变
});
```

- [ ] **Step 2: TypeScript 检查**

Run: `cd apps/server && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/features/jobs/executors/image-generation.ts
git commit -m "fix(worker): read image generation payload from DB instead of PGMQ message"
```

---

## Task 3: Server — generate_image tool 改为异步任务提交

**Files:**
- Modify: `apps/server/src/agent/tools/image-generate.ts`

**Context:** 当前 tool 直接调用 `generateImage("replicate", ...)` 同步等 Replicate API 返回。改为通过注入的 `submitImageJob` 函数创建 background job 并立即返回。

- [ ] **Step 1: 定义 SubmitImageJobFn 类型并修改 tool 依赖**

```typescript
// apps/server/src/agent/tools/image-generate.ts

// 新增类型
export type SubmitImageJobFn = (input: {
  prompt: string;
  title: string;
  model: string;
  aspectRatio: string;
  inputImages?: string[];
}) => Promise<{ jobId: string }>;

// 修改 deps 类型，增加 submitImageJob
// createImageGenerateTool(deps?: { persistImage?: PersistImageFn; submitImageJob?: SubmitImageJobFn })
```

- [ ] **Step 2: 修改 runImageGenerate 支持异步模式**

核心逻辑：如果 `submitImageJob` 存在，走异步路径（提交任务立即返回）；否则保留同步路径（向后兼容，比如直接 API 调用场景）。

```typescript
export async function runImageGenerate(
  input: z.infer<typeof imageGenerateSchema>,
  persistImage?: PersistImageFn,
  submitImageJob?: SubmitImageJobFn,
): Promise<ImageGenerateResult> {
  // 异步模式：提交任务即返回
  if (submitImageJob) {
    const { jobId } = await submitImageJob({
      prompt: input.prompt,
      title: input.title,
      model: input.model,
      aspectRatio: input.aspectRatio,
      inputImages: input.inputImages,
    });
    return {
      summary: `Image generation job submitted (jobId: ${jobId}), model: ${input.model}`,
      title: input.title,
      jobId,
      model: input.model,
      imageUrl: "", // 占位，异步模式下无即时 URL
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    };
  }

  // 同步模式（向后兼容）
  const result = await generateImage("replicate", { ... });
  // ... 现有逻辑
}
```

注意 `ImageGenerateResult` 类型需要增加 `jobId?: string` 和 `model?: string` 字段。

- [ ] **Step 3: 更新 createImageGenerateTool 传递 submitImageJob**

```typescript
export function createImageGenerateTool(deps?: {
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
}) {
  return tool(
    async (input) => {
      const result = await runImageGenerate(
        input,
        deps?.persistImage,
        deps?.submitImageJob,
      );
      return JSON.stringify(result);
    },
    { name: "generate_image", description: "...", schema: imageGenerateSchema },
  );
}
```

- [ ] **Step 4: TypeScript 类型检查**

Run: `cd apps/server && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/tools/image-generate.ts
git commit -m "feat(agent): generate_image tool supports async job submission"
```

---

## Task 3: Server — Sub-agent response schema 支持 jobId

**Files:**
- Modify: `apps/server/src/agent/sub-agents.ts`

- [ ] **Step 1: 更新 imageGenerateResponseSchema**

```typescript
const imageGenerateResponseSchema = z.object({
  url: z.string().describe("Generated image URL, empty string if async job submitted"),
  jobId: z.string().optional().describe("Background job ID when async generation is used"),
  model: z.string().optional().describe("Model used for generation"),
  title: z.string().describe("Short descriptive title for the generated image"),
  placement: z.object({
    x: z.number().describe("Left edge x coordinate on canvas"),
    y: z.number().describe("Top edge y coordinate on canvas"),
    width: z.number().default(512).describe("Display width"),
    height: z.number().default(512).describe("Display height"),
  }).describe("Where to place the image on the canvas"),
});
```

- [ ] **Step 2: 更新 sub-agent systemPrompt 说明异步模式**

在 systemPrompt 中补充说明：当 generate_image tool 返回 jobId 时，将 jobId 和 model 原样传递到 response 中，url 设为空字符串。

- [ ] **Step 3: 传递 submitImageJob 到 sub-agent**

```typescript
export function createImageSubAgent(deps?: {
  persistImage?: PersistImageFn;
  submitImageJob?: SubmitImageJobFn;
}): SubAgent {
  return {
    // ...
    tools: [createImageGenerateTool(deps)],
    // ...
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/agent/sub-agents.ts
git commit -m "feat(agent): sub-agent response schema supports async jobId"
```

---

## Task 4: Server — Runtime 注入 submitImageJob 闭包

**Files:**
- Modify: `apps/server/src/agent/runtime.ts`
- Modify: `apps/server/src/agent/deep-agent.ts`
- Modify: `apps/server/src/app.ts`

**Context:** 仿照现有 `persistImage` 闭包模式，在 runtime.ts 中创建 `submitImageJob` 闭包，捕获 user context 传递给 agent factory。

**关键注意：** `jobService.createJob` 的签名是 `(user: AuthenticatedUser, input: CreateJobInput)`，其中：
- `AuthenticatedUser` 需要 `{ id, accessToken, email, userMetadata }` — 不是裸 `accessToken`
- `CreateJobInput` 需要 `workspaceId: string` — 必须先查 workspace
- 参考现有 `jobs.ts` HTTP route：先调 `viewerService.ensureViewer(user)` 获取 workspace

- [ ] **Step 1: app.ts — 传递 jobService + viewerService 给 agentRunService**

```typescript
// app.ts line ~149
const agentRuns = createAgentRunService({
  // ...existing options...
  jobService,        // ← 新增
  viewerService,     // ← 新增（用于在闭包中解析 workspace）
});
```

- [ ] **Step 2: runtime.ts — 扩展 CreateAgentRuntimeOptions**

```typescript
type CreateAgentRuntimeOptions = {
  // ...existing fields...
  jobService?: JobService;
  viewerService?: ViewerService;
};
```

- [ ] **Step 3: runtime.ts — 在 streamRun 中存储 AuthenticatedUser**

在 `streamRun` 函数中，run 对象已经有 `accessToken`。需要在 run 创建时把完整的 `AuthenticatedUser` 信息传入（从 HTTP route 已认证的 user 对象获取），或在 runtime 中通过 viewerService 解析。

最简方案：在 `RuntimeRunRecord` 中新增可选 `userId` 字段，从 run 创建时传入：

```typescript
type RuntimeRunRecord = RunCreateRequest & {
  // ...existing fields...
  userId?: string;
};
```

runs.ts HTTP route 在创建 run 时已经有认证后的 user 对象，可以把 `userId` 传进来。

- [ ] **Step 4: runtime.ts — 创建 submitImageJob 闭包（修正版）**

```typescript
// Build submitImageJob closure for async image generation
let submitImageJob: SubmitImageJobFn | undefined;
if (options.jobService && run.accessToken && run.userId && options.viewerService) {
  const jobSvc = options.jobService;
  const accessToken = run.accessToken;
  const userId = run.userId;
  const canvasId = run.canvasId;

  submitImageJob = async (input) => {
    // 构造 AuthenticatedUser（jobService 需要）
    const user: AuthenticatedUser = {
      id: userId,
      accessToken,
      email: "",           // job service 只用 id 和 accessToken
      userMetadata: {},
    };

    // 查 workspace（createJob 需要 workspaceId）
    const viewer = await options.viewerService!.ensureViewer(user);
    const workspaceId = viewer.workspace.id;

    const job = await jobSvc.createJob(user, {
      workspaceId,
      canvasId: canvasId,
      jobType: "image_generation",
      payload: {
        prompt: input.prompt,
        title: input.title,
        model: input.model,
        aspect_ratio: input.aspectRatio,
        input_images: input.inputImages,
      },
    });
    return { jobId: job.id };
  };
}
```

注意 `viewerService.ensureViewer` 每次调用会查 DB，但每次图片生成只调一次，性能可接受。

- [ ] **Step 4: runtime.ts — 将 submitImageJob 传入 agent factory**

```typescript
agent = resolvedAgentFactory({
  // ...existing options...
  ...(submitImageJob ? { submitImageJob } : {}),
});
```

- [ ] **Step 5: deep-agent.ts — 接收 submitImageJob 并传给 sub-agents**

```typescript
// deep-agent.ts createLoomicDeepAgent options type 中增加 submitImageJob
// 传递到 createImageSubAgent:
subagents: [
  createImageSubAgent({
    persistImage: options.persistImage,
    submitImageJob: options.submitImageJob,
  }),
  createVideoSubAgent(),
],
```

- [ ] **Step 6: TypeScript 类型检查**

Run: `cd apps/server && npx tsc --noEmit`
Expected: 无新增错误（已有的 global-agent 错误忽略）

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/agent/runtime.ts apps/server/src/agent/deep-agent.ts
git commit -m "feat(agent): inject submitImageJob closure through runtime → agent → sub-agent"
```

---

## Task 5: Server — Stream adapter 处理异步 job artifacts

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts`

**Context:** 当 sub-agent 返回包含 `jobId` 的响应时，stream adapter 需要 emit `job.submitted` 事件替代普通的 `tool.completed` artifact。

- [ ] **Step 1: 修改 extractArtifacts 处理 jobId 模式**

在 `extractArtifacts` 函数中（~line 254-273），当检测到 `record.jobId` 时，将 jobId 注入到 artifact：

```typescript
// 在 candidate 构建逻辑中
if (typeof record.jobId === "string" && record.jobId.length > 0) {
  candidate.jobId = record.jobId;
}
```

`imageArtifactSchema` 已经有 `jobId` optional 字段（Task 1 添加），safeParse 会自动包含。

- [ ] **Step 2: 在 adaptDeepAgentStream 中从 raw record 检测 jobId 并 emit job.submitted**

**重要：** 不要依赖 `extractArtifacts` 的结果来检测 jobId。因为异步模式下 `url` 为空字符串，`extractArtifacts` 会跳过（url.length > 0 检查失败），导致 artifact 不包含 jobId。

直接在 `on_tool_end` 处理逻辑中从 unwrapped record 检测 jobId：

```typescript
// on_tool_end handler 中，在 extractArtifacts 之前或之后
// 先检查是否为异步 job 提交模式
const unwrapped = unwrapCommandOutput(parsed);
if (typeof unwrapped.jobId === "string" && unwrapped.jobId.length > 0) {
  // 异步模式：emit job.submitted 事件，跳过普通 artifact
  yield {
    type: "job.submitted" as const,
    runId,
    jobId: unwrapped.jobId,
    jobType: "image_generation",
    title: typeof unwrapped.title === "string" ? unwrapped.title : undefined,
    model: typeof unwrapped.model === "string" ? unwrapped.model : undefined,
    placement: unwrapped.placement && typeof unwrapped.placement === "object"
      ? unwrapped.placement as { x: number; y: number; width: number; height: number }
      : undefined,
    timestamp: new Date().toISOString(),
  } satisfies JobSubmittedEvent;

  // 仍然 emit tool.completed 但不带 artifacts
  yield { type: "tool.completed", runId, toolCallId, toolName, outputSummary, timestamp };
  continue; // 跳过正常 artifact 处理
}

// 正常同步模式：保留现有 extractArtifacts 逻辑
```

这样避免了 `imageUrl: ""` 进入 artifact 提取流程的问题。

注意 import `JobSubmittedEvent` 类型从 `@loomic/shared`。

- [ ] **Step 3: TypeScript 类型检查**

Run: `cd apps/server && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts
git commit -m "feat(agent): stream adapter emits job.submitted events for async image generation"
```

---

## Task 6: Frontend — Job polling API 和 Hook

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`
- Create: `apps/web/src/hooks/use-job-polling.ts`

- [ ] **Step 1: server-api.ts 新增 fetchJob**

```typescript
// apps/web/src/lib/server-api.ts
export async function fetchJob(
  accessToken: string,
  jobId: string,
): Promise<BackgroundJob> {
  const res = await serverFetch(`/api/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { job: BackgroundJob };
  return data.job;
}
```

需要从 `@loomic/shared` 导入 `BackgroundJob` 类型。

- [ ] **Step 2: 创建 useJobPolling hook**

```typescript
// apps/web/src/hooks/use-job-polling.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJob } from "@/lib/server-api";
import type { BackgroundJob } from "@loomic/shared";

type PendingJob = {
  jobId: string;
  title?: string;
  model?: string;
  placement?: { x: number; y: number; width: number; height: number };
  startedAt: number; // Date.now() when submitted
};

type JobPollingResult = {
  pendingJobs: PendingJob[];
  addJob: (job: PendingJob) => void;
  completedJobs: Map<string, BackgroundJob>;
};

export function useJobPolling(accessToken: string): JobPollingResult {
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Map<string, BackgroundJob>>(new Map());
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const addJob = useCallback((job: PendingJob) => {
    setPendingJobs((prev) => [...prev, job]);
  }, []);

  // 用 ref 持有 pending list 避免 effect 频繁重建
  const pendingJobsRef = useRef(pendingJobs);
  pendingJobsRef.current = pendingJobs;

  useEffect(() => {
    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      const token = accessTokenRef.current;
      const current = pendingJobsRef.current;
      if (current.length === 0) return;

      // 并行轮询所有 pending jobs
      const results = await Promise.allSettled(
        current.map((p) => fetchJob(token, p.jobId).then((job) => ({ pending: p, job }))),
      );

      const finishedIds: string[] = [];
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const { pending, job } = r.value;
        if (job.status === "succeeded") {
          finishedIds.push(pending.jobId);
          setCompletedJobs((prev) => new Map(prev).set(pending.jobId, { ...job, _placement: pending.placement }));
        } else if (job.status === "failed" || job.status === "dead_letter" || job.status === "canceled") {
          finishedIds.push(pending.jobId);
        }
      }

      if (finishedIds.length > 0) {
        setPendingJobs((prev) => prev.filter((j) => !finishedIds.includes(j.jobId)));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pendingJobs.length]); // ← 只依赖 length，避免频繁重建

  return { pendingJobs, addJob, completedJobs };
}
```

- [ ] **Step 3: TypeScript 类型检查**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/server-api.ts apps/web/src/hooks/use-job-polling.ts
git commit -m "feat(web): add job polling hook and fetchJob API"
```

---

## Task 7: Frontend — 画布生成占位覆层

**Files:**
- Create: `apps/web/src/components/canvas-generating-overlay.tsx`

**Context:** 在画布区域上方叠加一个占位覆层，显示在指定 placement 位置。展示灰色方块 + "Generating" 文字 + 脉冲动画。当图片生成完成后移除。

- [ ] **Step 1: 创建 CanvasGeneratingOverlay 组件**

此组件需要 Excalidraw API 来将 canvas 坐标转换为 screen 坐标：

```typescript
// apps/web/src/components/canvas-generating-overlay.tsx
"use client";

import { useEffect, useState } from "react";

type GeneratingItem = {
  jobId: string;
  title?: string;
  model?: string;
  placement: { x: number; y: number; width: number; height: number };
  startedAt: number;
};

type Props = {
  items: GeneratingItem[];
  excalidrawApi: any;
};

export function CanvasGeneratingOverlay({ items, excalidrawApi }: Props) {
  const [tick, setTick] = useState(0);

  // 每秒更新计时器
  useEffect(() => {
    if (items.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0 || !excalidrawApi) return null;

  const appState = excalidrawApi.getAppState?.();
  if (!appState) return null;

  const zoom = appState.zoom?.value ?? 1;
  const scrollX = appState.scrollX ?? 0;
  const scrollY = appState.scrollY ?? 0;

  return (
    <>
      {items.map((item) => {
        // Canvas coords → screen coords
        const screenX = (item.placement.x + scrollX) * zoom;
        const screenY = (item.placement.y + scrollY) * zoom;
        const screenW = item.placement.width * zoom;
        const screenH = item.placement.height * zoom;
        const elapsed = Math.floor((Date.now() - item.startedAt) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        return (
          <div
            key={item.jobId}
            className="pointer-events-none absolute z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-black/10 bg-black/[0.04]"
            style={{
              left: screenX,
              top: screenY,
              width: screenW,
              height: screenH,
            }}
          >
            {/* 脉冲动画圆点 */}
            <div className="mb-2 size-6 animate-pulse rounded-full bg-black/10" />
            <span className="text-sm font-medium text-black/30">Generating</span>
            <span className="mt-1 text-xs text-black/20">{timeStr}</span>
          </div>
        );
      })}
    </>
  );
}
```

注意：此组件渲染在 canvas 容器内（`flex-1 relative` div），使用 `absolute` 定位。需要在 canvas page 的 `useEffect` 中监听 appState 变化来触发重渲染（zoom/scroll 变化时位置需要更新）。

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/canvas-generating-overlay.tsx
git commit -m "feat(web): add canvas generating placeholder overlay"
```

---

## Task 8: Frontend — Chat 生成进度指示器

**Files:**
- Modify: `apps/web/src/components/chat-message.tsx`

**Context:** 在聊天面板底部显示一个进度条，类似 Lovart 的 "使用 Nano Banana Pro 生成图片... 00:12/2分钟" 样式。此组件在 chat-sidebar 中渲染（不在 chat-message 内），作为独立的 sticky 底部元素。

- [ ] **Step 1: 在 chat-sidebar.tsx 中渲染进度指示器**

在消息列表和输入框之间添加 pending jobs 进度条。不需要新建独立文件，直接在 chat-sidebar.tsx 中渲染：

```tsx
{/* 在 input 区域上方 */}
{pendingJobs.length > 0 && (
  <div className="border-t border-black/[0.06] px-4 py-2">
    {pendingJobs.map((job) => {
      const elapsed = Math.floor((Date.now() - job.startedAt) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      return (
        <div key={job.jobId} className="flex items-center gap-2 text-sm text-black/50">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-black/20 border-t-black/60" />
          <span>
            {job.model
              ? `使用 ${job.model.split("/").pop()} 生成图片...`
              : "生成图片中..."}
          </span>
          <span className="ml-auto tabular-nums">{timeStr} / 2分钟</span>
        </div>
      );
    })}
  </div>
)}
```

需要在 chat-sidebar 中接入 `pendingJobs` 数据（来自 useJobPolling hook 或 props 传入）。

- [ ] **Step 2: 添加计时器 tick 更新**

用 `useEffect` + `setInterval(1000)` 在有 pending jobs 时每秒 forceUpdate：

```tsx
const [progressTick, setProgressTick] = useState(0);
useEffect(() => {
  if (pendingJobs.length === 0) return;
  const id = setInterval(() => setProgressTick((t) => t + 1), 1000);
  return () => clearInterval(id);
}, [pendingJobs.length]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx
git commit -m "feat(web): add image generation progress indicator in chat"
```

---

## Task 9: Frontend — Chat sidebar 处理 job.submitted 事件

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx`

**Context:** 当 SSE 流收到 `job.submitted` 事件时，触发 job polling 和画布占位图。

- [ ] **Step 1: ChatSidebar 接收 job polling props**

扩展 ChatSidebarProps：

```typescript
type ChatSidebarProps = {
  // ...existing props...
  onJobSubmitted?: (job: {
    jobId: string;
    title?: string;
    model?: string;
    placement?: { x: number; y: number; width: number; height: number };
  }) => void;
  pendingJobs?: PendingJob[];
};
```

- [ ] **Step 2: 在 event loop 中处理 job.submitted**

在 `handleSend` 函数的 event loop 中（~line 395-414），增加对 `job.submitted` 事件的处理：

```typescript
for await (const event of streamEvents(runId)) {
  handleStreamEvent(event);

  // 现有的 image artifact 处理
  if (event.type === "tool.completed" && event.artifacts && onImageGenerated) {
    for (const artifact of event.artifacts) {
      if (artifact.type === "image" && artifact.placement && !artifact.jobId) {
        // 同步模式（向后兼容）
        onImageGenerated(artifact as ImageArtifact);
      }
    }
  }

  // 新增：异步 job 提交事件处理
  if (event.type === "job.submitted" && onJobSubmitted) {
    onJobSubmitted({
      jobId: event.jobId,
      title: event.title,
      model: event.model,
      placement: event.placement,
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx
git commit -m "feat(web): handle job.submitted events in chat sidebar"
```

---

## Task 10: Frontend — Canvas page 整合 job polling + 占位图 + 真图替换

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx`

**Context:** Canvas page 是所有状态汇聚的地方。它需要：
1. 管理 useJobPolling hook
2. 当 job submitted 时添加到 pending 列表
3. 渲染 CanvasGeneratingOverlay
4. 当 job completed 时，从 job result 中取图片 URL，调用 insertImageOnCanvas

- [ ] **Step 1: 引入 useJobPolling 和 CanvasGeneratingOverlay**

```typescript
import { useJobPolling } from "@/hooks/use-job-polling";
import { CanvasGeneratingOverlay } from "@/components/canvas-generating-overlay";
```

- [ ] **Step 2: 在 CanvasPageContent 中接入 job polling**

```typescript
const { pendingJobs, addJob, completedJobs } = useJobPolling(accessToken);

// 处理 job submitted
const handleJobSubmitted = useCallback((job: {
  jobId: string;
  title?: string;
  model?: string;
  placement?: { x: number; y: number; width: number; height: number };
}) => {
  addJob({
    jobId: job.jobId,
    title: job.title,
    model: job.model,
    placement: job.placement ?? { x: 0, y: 0, width: 512, height: 512 },
    startedAt: Date.now(),
  });
}, [addJob]);
```

- [ ] **Step 3: 监听 completedJobs 变化，替换为真图**

```typescript
useEffect(() => {
  const api = excalidrawApiRef.current;
  if (!api || completedJobs.size === 0) return;

  for (const [jobId, job] of completedJobs) {
    if (job.status !== "succeeded" || !job.result) continue;
    const result = job.result as {
      signed_url?: string;
      width?: number;
      height?: number;
      mime_type?: string;
    };
    if (!result.signed_url) continue;

    // 找到对应的 pending job 获取 placement
    // pendingJobs 此时可能已经被清除，需要用一个 ref 或另一个 map 保存
    // 建议在 addJob 时同时保存到 placementMap ref
    const placement = placementMapRef.current.get(jobId);

    const artifact: ImageArtifact = {
      type: "image",
      title: job.payload?.title as string,
      url: result.signed_url,
      mimeType: result.mime_type ?? "image/png",
      width: result.width ?? 512,
      height: result.height ?? 512,
      placement: placement,
    };
    insertImageOnCanvas(api, artifact).catch(console.warn);
  }
}, [completedJobs]);
```

需要一个 `placementMapRef = useRef(new Map())` 来在 addJob 时保存 placement，因为 pendingJobs 完成后会被清除。

- [ ] **Step 4: 渲染 CanvasGeneratingOverlay**

在 canvas 容器 `<div className="flex-1 relative min-w-0">` 内添加：

```tsx
<CanvasGeneratingOverlay
  items={pendingJobs}
  excalidrawApi={excalidrawApi}
/>
```

- [ ] **Step 5: 传递 props 到 ChatSidebar**

```tsx
<ChatSidebar
  accessToken={accessToken}
  canvasId={canvasData.id}
  open={chatOpen}
  onToggle={() => setChatOpen(!chatOpen)}
  onImageGenerated={handleImageGenerated}
  onJobSubmitted={handleJobSubmitted}
  pendingJobs={pendingJobs}
  initialPrompt={initialPrompt}
/>
```

- [ ] **Step 6: 全量 TypeScript 检查**

Run: `cd apps/web && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/canvas/page.tsx
git commit -m "feat(web): integrate job polling, canvas placeholder, and image replacement"
```

---

## Task 11: E2E 验证

- [ ] **Step 1: 启动所有服务**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
npx turbo run dev --filter=@loomic/web --filter=@loomic/server
```

确保 web(3000) + server(3001) + worker 都在运行。

- [ ] **Step 2: 打开画布页面，输入图片生成 prompt**

在 chat 中输入 "帮我生成一个可爱的猫咪插画"

**Expected 行为:**
1. Agent 快速回复（1-3s）"好的，正在使用 Imagen 4 生成..."
2. 画布出现灰色占位方块 + "Generating" + 计时器
3. 聊天底部显示 "使用 imagen-4 生成图片... 00:XX / 2分钟" + 旋转动画
4. 30-60s 后，占位方块被真图替换
5. 进度条消失

- [ ] **Step 3: 验证错误处理**

- 停掉 worker，提交生成任务 → 占位图应持续显示
- 重启 worker → 任务应被 pick up 并完成

---

## 关键注意事项

### 向后兼容
- `submitImageJob` 是 optional 的。如果 PGMQ 未配置（无 `SUPABASE_DB_URL`），tool 走现有同步路径。
- 前端同时支持同步 artifact（无 jobId）和异步 artifact（有 jobId）。

### Worker 已存在（需小幅修复）
- `apps/server/src/worker.ts` 和 `apps/server/src/features/jobs/executors/image-generation.ts` 已实现图片生成 worker。
- Worker 从 PGMQ 读取任务 → 调 Replicate → 上传 Storage → 更新 job 状态。
- **需修复 executor：** 现有 executor 从 PGMQ 消息读 `prompt`，但 PGMQ 消息只包含 `{ job_id, job_type, workspace_id }`。需改为从 `background_jobs.payload` 列读取（Task 2）。

### 数据库迁移
- `background_jobs` 表已存在（migration `20260325200000`）。
- PGMQ queue `image_generation_jobs` 已创建。
- **不需要新的数据库迁移。**

### Placement 传递链路
```
Tool 提交 job（无 placement，因为 sub-agent 还没决定位置）
   ↓
Sub-agent 决定 placement → response schema 包含 { jobId, placement }
   ↓
Stream adapter 从 raw record 提取 → emit job.submitted 事件（含 placement）
   ↓
前端收到 job.submitted → 保存 placement 到 pendingJob → 渲染占位图
   ↓
Worker 完成 → 前端 fetchJob → 从 pendingJob 恢复 placement → insertImageOnCanvas
```
**重要：** placement 不在 job payload 中，因为 tool 提交 job 时 sub-agent 还没决定位置。placement 只存在于 SSE 事件流和前端状态中。`useJobPolling` hook 的 `completedJobs` 中携带了原始 `_placement` 元数据（从 PendingJob 保留）。

### 未来增强（Phase 2）
- 当 deepagents 修复 issue #131 后，可在 tool 中添加 `interrupt()` 让 agent 在图片完成后继续推理，生成更有上下文的完成回复。
- WebSocket 替代轮询，实时推送 job 状态。
- 支持多图并行生成。
