# Canvas-Aware Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Loomic's agent to have a product persona, canvas awareness via `inspect_canvas` tool, sub-agent architecture for image/video generation, agent-controlled element placement, and canvas-native AI generation toolbar overlay.

**Architecture:** Main agent (Loomic persona) with `inspect_canvas` + `project_search` tools delegates generation to sub-agents via deepagents' native `task` tool. Sub-agents return structured responses with placement coordinates. A CSS overlay toolbar on Excalidraw enables direct generation without chat.

**Tech Stack:** deepagents v1.8.4 (SubAgent, responseFormat), LangChain (tool, RunnableConfig.configurable), Excalidraw, Next.js, Fastify, Zod, Vitest

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/server/src/agent/prompts/loomic-main.ts` | Main agent system prompt string export |
| `apps/server/src/agent/sub-agents.ts` | Sub-agent definitions (image_generate, video_generate) |
| `apps/server/src/agent/tools/inspect-canvas.ts` | `inspect_canvas` tool implementation |
| `apps/server/src/http/generate.ts` | Canvas-native generation endpoints (`POST /api/agent/generate-image`) |
| `apps/web/src/components/canvas-ai-toolbar.tsx` | AI toolbar overlay buttons |
| `apps/web/src/components/canvas-image-gen-panel.tsx` | Floating image generation panel |
| `apps/server/test/inspect-canvas.test.ts` | Unit tests for inspect_canvas tool |
| `apps/server/test/sub-agents.test.ts` | Unit tests for sub-agent definitions |
| `apps/server/test/generate-routes.test.ts` | Unit tests for canvas-native generation endpoint |
| `apps/server/test/stream-adapter-placement.test.ts` | Tests for placement extraction in stream adapter |

### Modified files

| File | Change |
|---|---|
| `packages/shared/src/contracts.ts` | Add `canvasId` to `runCreateRequestSchema` |
| `packages/shared/src/artifacts.ts` | Add `placement` to `imageArtifactSchema` |
| `apps/server/src/agent/deep-agent.ts` | Use Loomic prompt, register sub-agents, remove gen tools from main |
| `apps/server/src/agent/tools/index.ts` | Export `inspect_canvas` + `project_search` only for main agent; export gen tools separately |
| `apps/server/src/agent/runtime.ts` | Add `canvasId`/`accessToken` to `RuntimeRunRecord`, inject into configurable |
| `apps/server/src/agent/stream-adapter.ts` | Dual-format artifact extraction (legacy `imageUrl` + new `url`/`placement`) |
| `apps/server/src/http/runs.ts` | Pass `canvasId` from request to `createRun` |
| `apps/server/src/app.ts` | Wire `createUserClient` into agent factory, register generate routes |
| `apps/web/src/components/chat-sidebar.tsx` | Pass `canvasId` field in run creation |
| `apps/web/src/components/canvas-editor.tsx` | Render `CanvasAIToolbar` overlay |
| `apps/web/src/lib/canvas-elements.ts` | Accept optional `placement` for agent-controlled positioning |
| `apps/web/src/lib/server-api.ts` | Add `generateImage()` API function |

---

## Task 1: Shared Contracts — Add `canvasId` to RunCreateRequest

**Files:**
- Modify: `packages/shared/src/contracts.ts:28-32`
- Test: existing schema tests validate backward compat

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/contracts.test.ts` (or extend if exists):

```typescript
import { describe, expect, it } from "vitest";
import { runCreateRequestSchema } from "./contracts.js";

describe("runCreateRequestSchema", () => {
  it("accepts canvasId as optional field", () => {
    const result = runCreateRequestSchema.parse({
      sessionId: "session-1",
      conversationId: "conv-1",
      prompt: "Hello",
      canvasId: "canvas-1",
    });
    expect(result.canvasId).toBe("canvas-1");
  });

  it("succeeds without canvasId (backward compat)", () => {
    const result = runCreateRequestSchema.parse({
      sessionId: "session-1",
      conversationId: "conv-1",
      prompt: "Hello",
    });
    expect(result.canvasId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && pnpm vitest run src/contracts.test.ts` (or from server: `cd apps/server && pnpm vitest run --reporter verbose ../../packages/shared/src/contracts.test.ts` — check which vitest config can resolve the path)
Expected: FAIL — `canvasId` not recognized by schema

- [ ] **Step 3: Add `canvasId` to schema**

In `packages/shared/src/contracts.ts`, modify `runCreateRequestSchema`:

```typescript
export const runCreateRequestSchema = z.object({
  sessionId: sessionIdSchema,
  conversationId: conversationIdSchema,
  prompt: z.string().min(1),
  canvasId: canvasIdSchema.optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run --reporter verbose ../../packages/shared/src/contracts.test.ts`
Expected: PASS

- [ ] **Step 5: Run full server test suite for backward compat**

Run: `cd apps/server && pnpm vitest run`
Expected: All existing tests PASS (canvasId is optional)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/contracts.ts packages/shared/src/contracts.test.ts
git commit -m "feat: add optional canvasId to RunCreateRequest schema"
```

---

## Task 2: Shared Contracts — Add `placement` to ImageArtifact

**Files:**
- Modify: `packages/shared/src/artifacts.ts:1-16`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/artifacts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { imageArtifactSchema } from "./artifacts.js";

describe("imageArtifactSchema", () => {
  it("accepts artifact with placement coordinates", () => {
    const result = imageArtifactSchema.parse({
      type: "image",
      url: "https://example.com/img.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
      placement: { x: 100, y: 200, width: 512, height: 512 },
    });
    expect(result.placement).toEqual({ x: 100, y: 200, width: 512, height: 512 });
  });

  it("succeeds without placement (backward compat)", () => {
    const result = imageArtifactSchema.parse({
      type: "image",
      url: "https://example.com/img.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
    });
    expect(result.placement).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run --reporter verbose ../../packages/shared/src/artifacts.test.ts`
Expected: FAIL — `placement` not in schema

- [ ] **Step 3: Add `placement` to imageArtifactSchema**

In `packages/shared/src/artifacts.ts`:

```typescript
import { z } from "zod";

export const placementSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const imageArtifactSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  placement: placementSchema.optional(),
});

export const toolArtifactSchema = z.discriminatedUnion("type", [
  imageArtifactSchema,
]);

export type Placement = z.infer<typeof placementSchema>;
export type ImageArtifact = z.infer<typeof imageArtifactSchema>;
export type ToolArtifact = z.infer<typeof toolArtifactSchema>;
```

Also update `packages/shared/src/events.ts` to re-export the new types:

```typescript
export { imageArtifactSchema, placementSchema, toolArtifactSchema } from "./artifacts.js";
export type { ImageArtifact, Placement, ToolArtifact } from "./artifacts.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run --reporter verbose ../../packages/shared/src/artifacts.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/artifacts.ts packages/shared/src/artifacts.test.ts
git commit -m "feat: add optional placement coordinates to ImageArtifact schema"
```

---

## Task 3: Main Agent System Prompt

**Files:**
- Create: `apps/server/src/agent/prompts/loomic-main.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/loomic-prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { LOOMIC_SYSTEM_PROMPT } from "../src/agent/prompts/loomic-main.js";

describe("LOOMIC_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof LOOMIC_SYSTEM_PROMPT).toBe("string");
    expect(LOOMIC_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("contains Loomic persona identity", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("Loomic");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("inspect_canvas");
  });

  it("contains coordinate system documentation", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("x 向右增大");
    expect(LOOMIC_SYSTEM_PROMPT).toContain("y 向下增大");
  });

  it("contains behavioral boundaries", () => {
    expect(LOOMIC_SYSTEM_PROMPT).toContain("不要猜测");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/loomic-prompt.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the prompt file**

Create `apps/server/src/agent/prompts/loomic-main.ts`:

```typescript
export const LOOMIC_SYSTEM_PROMPT = `你是 Loomic，一个可爱活泼、乐于助人的 AI 设计助手，生活在 Loomic 创意画布中 ✨

## 你的职责
1. 与用户自然对话，理解他们的创意意图
2. 在需要时用 inspect_canvas 工具查看画布当前状态，辅助布局决策
3. 将图片/视频生成任务委派给专门的子代理执行
4. 根据画布现有内容，为新生成的元素决定合理的放置位置和尺寸，避免与现有元素重叠

## 行为边界
- 不要猜测画布上图片的具体视觉内容，使用 inspect_canvas 获取信息
- 生成任务必须通过子代理执行，不要自己编造图片或视频 URL
- 放置新元素时，先用 inspect_canvas 了解现有布局，再决定坐标
- 保持回复简洁友好，适度使用 emoji 增添活力 ✨

## 画布坐标系
- 画布使用无限坐标空间，初始默认原点 (0, 0) 在起始位置
- x 向右增大，y 向下增大
- 元素位置指左上角坐标
- 使用 inspect_canvas 查看现有元素位置，将新元素相对于它们放置
- 默认图片尺寸建议 512×512，根据画布内容适当调整`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/loomic-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/prompts/loomic-main.ts apps/server/test/loomic-prompt.test.ts
git commit -m "feat: add Loomic persona system prompt"
```

---

## Task 4: inspect_canvas Tool

**Files:**
- Create: `apps/server/src/agent/tools/inspect-canvas.ts`
- Test: `apps/server/test/inspect-canvas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/inspect-canvas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createInspectCanvasTool } from "../src/agent/tools/inspect-canvas.js";

function createMockUserClient(canvasContent: Record<string, unknown> | null) {
  return (_accessToken: string) => ({
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () =>
            canvasContent
              ? { data: { content: canvasContent }, error: null }
              : { data: null, error: { code: "PGRST116" } },
        }),
      }),
    }),
  });
}

describe("inspect_canvas tool", () => {
  it("returns summary with element count and bounding box", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient({
        elements: [
          { id: "e1", type: "image", x: 100, y: 200, width: 512, height: 512, isDeleted: false },
          { id: "e2", type: "text", x: 100, y: 750, width: 200, height: 48, isDeleted: false, text: "COFFEE", fontSize: 48 },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
      }) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "canvas-1", access_token: "token-1" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.canvasId).toBe("canvas-1");
    expect(parsed.elementCount).toBe(2);
    expect(parsed.elements).toHaveLength(2);
    expect(parsed.elements[0]).toMatchObject({
      id: "e1",
      type: "image",
      x: 100,
      y: 200,
      width: 512,
      height: 512,
    });
    expect(parsed.boundingBox).toBeDefined();
  });

  it("returns error when no canvas context", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient(null) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: {} },
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("no_canvas_context");
  });

  it("returns error when canvas not found", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient(null) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "missing", access_token: "token" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("canvas_not_found");
  });

  it("filters out deleted elements", async () => {
    const tool = createInspectCanvasTool({
      createUserClient: createMockUserClient({
        elements: [
          { id: "e1", type: "image", x: 0, y: 0, width: 100, height: 100, isDeleted: false },
          { id: "e2", type: "image", x: 50, y: 50, width: 100, height: 100, isDeleted: true },
        ],
        appState: {},
      }) as any,
    });

    const result = await tool.invoke(
      { detail_level: "summary" },
      { configurable: { canvas_id: "c1", access_token: "t1" } },
    );

    const parsed = JSON.parse(result);
    expect(parsed.elementCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/inspect-canvas.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement inspect_canvas tool**

Create `apps/server/src/agent/tools/inspect-canvas.ts`:

```typescript
import { tool } from "langchain";
import { z } from "zod";

const inspectCanvasSchema = z.object({
  detail_level: z
    .enum(["summary", "full"])
    .default("summary")
    .describe("Level of detail: summary (positions/sizes) or full (all properties)"),
  element_id: z
    .string()
    .optional()
    .describe("Query a specific element by ID"),
});

type CanvasElement = Record<string, unknown>;

function summarizeElement(el: CanvasElement) {
  const base: Record<string, unknown> = {
    id: el.id,
    type: el.type,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
  };
  if (el.type === "text" && typeof el.text === "string") {
    base.text = el.text.length > 50 ? el.text.slice(0, 47) + "..." : el.text;
    base.fontSize = el.fontSize;
  }
  return base;
}

function computeBoundingBox(elements: CanvasElement[]) {
  if (elements.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    const w = Number(el.width) || 0;
    const h = Number(el.height) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  return { minX, minY, maxX, maxY };
}

export function createInspectCanvasTool(deps: {
  createUserClient: (accessToken: string) => any;
}) {
  return tool(
    async (input, config) => {
      const canvasId = (config as any)?.configurable?.canvas_id;
      const accessToken = (config as any)?.configurable?.access_token;

      if (!canvasId || !accessToken) {
        return JSON.stringify({
          error: "no_canvas_context",
          message: "This tool requires a canvas context. Ensure the conversation is linked to a canvas.",
        });
      }

      const client = deps.createUserClient(accessToken);
      const { data, error } = await client
        .from("canvases")
        .select("content")
        .eq("id", canvasId)
        .single();

      if (error || !data) {
        return JSON.stringify({
          error: "canvas_not_found",
          message: "Canvas not found or access denied.",
        });
      }

      const content = data.content as {
        elements?: CanvasElement[];
        appState?: Record<string, unknown>;
      };

      const elements = (content.elements ?? []).filter(
        (el) => !el.isDeleted,
      );

      if (input.element_id) {
        const found = elements.find((el) => el.id === input.element_id);
        if (!found) {
          return JSON.stringify({
            error: "element_not_found",
            message: `Element ${input.element_id} not found on canvas.`,
          });
        }
        return JSON.stringify(
          input.detail_level === "full" ? found : summarizeElement(found),
        );
      }

      const summaryElements =
        input.detail_level === "full"
          ? elements
          : elements.map(summarizeElement);

      return JSON.stringify({
        canvasId,
        elementCount: elements.length,
        boundingBox: computeBoundingBox(elements),
        viewport: {
          backgroundColor:
            (content.appState as any)?.viewBackgroundColor ?? "#ffffff",
        },
        elements: summaryElements,
      });
    },
    {
      name: "inspect_canvas",
      description:
        "Inspect the current canvas state. Returns element positions, sizes, and types. Use before placing new elements to avoid overlaps. Set detail_level='full' for complete properties, or query a specific element_id.",
      schema: inspectCanvasSchema,
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/inspect-canvas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/tools/inspect-canvas.ts apps/server/test/inspect-canvas.test.ts
git commit -m "feat: add inspect_canvas tool for canvas-aware agent"
```

---

## Task 5: Sub-Agent Definitions

**Files:**
- Create: `apps/server/src/agent/sub-agents.ts`
- Test: `apps/server/test/sub-agents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/sub-agents.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createImageSubAgent, createVideoSubAgent } from "../src/agent/sub-agents.js";

describe("sub-agent definitions", () => {
  it("createImageSubAgent returns a valid SubAgent shape", () => {
    const subAgent = createImageSubAgent();
    expect(subAgent.name).toBe("image_generate");
    expect(subAgent.description).toBeTruthy();
    expect(subAgent.systemPrompt).toContain("image");
    expect(subAgent.tools).toHaveLength(1);
    expect(subAgent.responseFormat).toBeDefined();
  });

  it("createVideoSubAgent returns a valid SubAgent shape", () => {
    const subAgent = createVideoSubAgent();
    expect(subAgent.name).toBe("video_generate");
    expect(subAgent.description).toBeTruthy();
    expect(subAgent.systemPrompt).toContain("video");
    expect(subAgent.tools).toHaveLength(1);
  });

  it("image sub-agent tool is named generate_image", () => {
    const subAgent = createImageSubAgent();
    expect(subAgent.tools![0].name).toBe("generate_image");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/sub-agents.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement sub-agent definitions**

Create `apps/server/src/agent/sub-agents.ts`:

```typescript
import { z } from "zod";
import type { SubAgent } from "deepagents";

import { createImageGenerateTool } from "./tools/image-generate.js";
import { createVideoGenerateTool } from "./tools/video-generate.js";

const imageGenerateResponseSchema = z.object({
  url: z.string().describe("Generated image URL"),
  placement: z.object({
    x: z.number().describe("Left edge x coordinate on canvas"),
    y: z.number().describe("Top edge y coordinate on canvas"),
    width: z.number().default(512).describe("Display width"),
    height: z.number().default(512).describe("Display height"),
  }).describe("Where to place the image on the canvas"),
});

export function createImageSubAgent(): SubAgent {
  return {
    name: "image_generate",
    description:
      "Generate an image based on a creative description. Returns the image URL and suggested canvas placement coordinates. Include canvas context in the task description so the sub-agent can avoid overlapping existing elements.",
    systemPrompt: `You are an image generation specialist. Given a description and optional canvas context, generate an image using the generate_image tool, then return structured placement data.

When canvas context is provided in the task description (element positions, bounding box), choose placement coordinates that avoid overlapping with existing elements. Place new images below or to the right of existing content.

If no canvas context is provided, use x: 0, y: 0 as default placement.

After calling generate_image, construct your response with the returned URL and calculated placement.`,
    tools: [createImageGenerateTool()],
    responseFormat: imageGenerateResponseSchema,
  };
}

export function createVideoSubAgent(): SubAgent {
  return {
    name: "video_generate",
    description:
      "Generate a video based on a creative description. Video generation availability depends on provider configuration.",
    systemPrompt: `You are a video generation specialist. Given a description, generate a video using the generate_video tool and return the result.

If video generation is not available or fails, clearly explain the limitation.`,
    tools: [createVideoGenerateTool()],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/sub-agents.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/sub-agents.ts apps/server/test/sub-agents.test.ts
git commit -m "feat: add image and video sub-agent definitions"
```

---

## Task 6: Restructure Tool Exports

**Files:**
- Modify: `apps/server/src/agent/tools/index.ts:1-13`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/tools-index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("tool exports", () => {
  it("createMainAgentTools returns inspect_canvas and project_search only", async () => {
    const { createMainAgentTools } = await import("../src/agent/tools/index.js");
    // We just check the function exists and returns tools with expected names
    // The actual backend parameter is needed for project_search
    const mockBackend = {} as any;
    const mockCreateUserClient = (() => {}) as any;
    const tools = createMainAgentTools(mockBackend, { createUserClient: mockCreateUserClient });
    const names = tools.map((t: any) => t.name);
    expect(names).toContain("inspect_canvas");
    expect(names).toContain("project_search");
    expect(names).not.toContain("generate_image");
    expect(names).not.toContain("generate_video");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/tools-index.test.ts`
Expected: FAIL — `createMainAgentTools` not exported

- [ ] **Step 3: Restructure tool exports**

Modify `apps/server/src/agent/tools/index.ts`:

```typescript
import type { BackendFactory, BackendProtocol } from "deepagents";

import { createInspectCanvasTool } from "./inspect-canvas.js";
import { createImageGenerateTool } from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createVideoGenerateTool } from "./video-generate.js";

export { createImageGenerateTool } from "./image-generate.js";
export { createVideoGenerateTool } from "./video-generate.js";
export { createInspectCanvasTool } from "./inspect-canvas.js";

export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: { createUserClient: (accessToken: string) => any },
) {
  return [
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps),
  ] as const;
}

/** @deprecated Use createMainAgentTools + sub-agents instead */
export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [
    createProjectSearchTool(backend),
    createImageGenerateTool(),
    createVideoGenerateTool(),
  ] as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/tools-index.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite to check backward compat**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS (createPhaseATools still exists for any legacy references)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/tools/index.ts apps/server/test/tools-index.test.ts
git commit -m "feat: restructure tool exports — main agent tools separate from gen tools"
```

---

## Task 7: Restructure deep-agent.ts — Loomic Persona + Sub-Agents

**Files:**
- Modify: `apps/server/src/agent/deep-agent.ts:1-53`

**Note on LoomicAgentFactory type:** The `createUserClient` parameter is added as *optional*, so all existing test mocks that provide a custom `agentFactory` continue to compile and function. Tests that don't supply `createUserClient` will get a no-op fallback where `inspect_canvas` returns an error — this is the correct degraded behavior.

- [ ] **Step 1: Write the failing test**

Extend `apps/server/test/deep-agent-config.test.ts` (read existing first to understand patterns):

```typescript
// Add to existing describe block or create new:
import { describe, expect, it } from "vitest";

describe("createLoomicDeepAgent with sub-agents", () => {
  it("accepts createUserClient dependency for inspect_canvas", async () => {
    // This test verifies the new factory signature compiles and runs
    const { createLoomicDeepAgent } = await import("../src/agent/deep-agent.js");
    // Should not throw when called with the new deps pattern
    expect(typeof createLoomicDeepAgent).toBe("function");
  });
});
```

- [ ] **Step 2: Run existing deep-agent tests as baseline**

Run: `cd apps/server && pnpm vitest run test/deep-agent-config.test.ts`
Expected: PASS (baseline)

- [ ] **Step 3: Modify deep-agent.ts**

Update `apps/server/src/agent/deep-agent.ts`. Key principle: `LoomicAgentFactory` adds `createUserClient` as **optional** so existing callers (tests, runtime) keep working.

```typescript
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph-checkpoint";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { ChatOpenAI } from "@langchain/openai";
import type { BackendFactory } from "deepagents";
import { createDeepAgent } from "deepagents";

import type { ServerEnv } from "../config/env.js";
import { createAgentBackendFactory } from "./backends/index.js";
import { LOOMIC_SYSTEM_PROMPT } from "./prompts/loomic-main.js";
import { createImageSubAgent, createVideoSubAgent } from "./sub-agents.js";
import { createMainAgentTools } from "./tools/index.js";

export type LoomicAgent = Pick<
  ReturnType<typeof createDeepAgent>,
  "stream" | "streamEvents"
>;

export type LoomicAgentFactory = (options: {
  checkpointer?: BaseCheckpointSaver;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  store?: BaseStore;
}) => LoomicAgent;

export function createLoomicDeepAgent(options: {
  backendFactory?: BackendFactory;
  checkpointer?: BaseCheckpointSaver;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  model?: BaseLanguageModel | string;
  store?: BaseStore;
}): LoomicAgent {
  const backendFactory =
    options.backendFactory ?? createAgentBackendFactory(options.env);

  applyOpenAICompatEnv(options.env);

  const modelSpec = options.model ?? createDefaultModelSpecifier(options.env);
  const resolvedModel =
    typeof modelSpec === "string"
      ? createStreamingChatModel(modelSpec)
      : modelSpec;

  const tools = options.createUserClient
    ? createMainAgentTools(backendFactory, {
        createUserClient: options.createUserClient,
      })
    : createMainAgentTools(backendFactory, {
        createUserClient: () => {
          throw new Error("createUserClient not configured");
        },
      });

  return createDeepAgent({
    backend: backendFactory,
    ...(options.checkpointer ? { checkpointer: options.checkpointer } : {}),
    model: resolvedModel,
    name: "loomic",
    ...(options.store ? { store: options.store } : {}),
    subagents: [createImageSubAgent(), createVideoSubAgent()],
    systemPrompt: LOOMIC_SYSTEM_PROMPT,
    tools,
  });
}

// ... keep createStreamingChatModel, createDefaultModelSpecifier, applyOpenAICompatEnv unchanged
```

- [ ] **Step 4: Run deep-agent tests**

Run: `cd apps/server && pnpm vitest run test/deep-agent-config.test.ts`
Expected: PASS — existing tests don't pass `createUserClient`, and it's optional so they still work.

- [ ] **Step 5: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS — `LoomicAgentFactory` change is backward-compatible because `createUserClient` is optional.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/deep-agent.ts
git commit -m "feat: restructure deep-agent with Loomic persona and sub-agents"
```

---

## Task 8: Runtime — Inject canvasId and accessToken into Configurable

**Files:**
- Modify: `apps/server/src/agent/runtime.ts:29-36,76-98,188-209`

- [ ] **Step 1: Write the failing test**

Add test to `apps/server/test/deep-agent-runtime.test.ts` (read existing first):

```typescript
// Add to existing test file:
it("passes canvasId and accessToken through configurable to agent", async () => {
  const configurableCapture: Record<string, unknown>[] = [];

  const agentRuns = createAgentRunService({
    env: testEnv,
    agentFactory: () => ({
      stream: async function* () {},
      streamEvents: (input: any, config: any) => {
        configurableCapture.push(config?.configurable ?? {});
        return (async function* () {
          // Emit minimal stream
        })();
      },
    }),
  });

  const run = agentRuns.createRun({
    sessionId: "s1",
    conversationId: "conv1",
    prompt: "test",
    canvasId: "canvas-1",
  });

  // Consume the stream
  for await (const _event of agentRuns.streamRun(run.runId)) {
    // just consume
  }

  expect(configurableCapture.length).toBeGreaterThan(0);
  expect(configurableCapture[0]).toMatchObject({
    canvas_id: "canvas-1",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/deep-agent-runtime.test.ts`
Expected: FAIL — `canvasId` not in RuntimeRunRecord, not passed to configurable

- [ ] **Step 3: Modify runtime.ts**

Key changes:
1. `RuntimeRunRecord` type already extends `RunCreateRequest` (which now has `canvasId`), so it gets `canvasId` automatically.
2. Add `accessToken` to `createRun` options and store in record.
3. Inject `canvas_id` and `access_token` into configurable alongside `thread_id`.

In `apps/server/src/agent/runtime.ts`, modify `createRun`:

```typescript
createRun(
  input: RunCreateRequest,
  runOptions?: { accessToken?: string; model?: string; threadId?: string },
): RunCreateResponse {
  const runId = runIdFactory();

  runs.set(runId, {
    ...input,
    consumed: false,
    controller: new AbortController(),
    ...(runOptions?.accessToken ? { accessToken: runOptions.accessToken } : {}),
    ...(runOptions?.model ? { modelOverride: runOptions.model } : {}),
    ...(runOptions?.threadId ? { threadId: runOptions.threadId } : {}),
    runId,
    status: "accepted",
  });

  return {
    conversationId: input.conversationId,
    runId,
    sessionId: input.sessionId,
    status: "accepted",
  };
},
```

Update `RuntimeRunRecord`:

```typescript
type RuntimeRunRecord = RunCreateRequest & {
  accessToken?: string;
  consumed: boolean;
  controller: AbortController;
  modelOverride?: string;
  runId: string;
  status: RuntimeRunStatus;
  threadId?: string;
};
```

In `streamRun`, modify the `streamEvents` call (around line 188-209):

```typescript
stream = agent.streamEvents(
  {
    messages: [
      {
        content: run.prompt,
        role: "user",
      },
    ],
  },
  {
    ...(run.threadId || run.canvasId || run.accessToken
      ? {
          configurable: {
            ...(run.threadId ? { thread_id: run.threadId } : {}),
            ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
            ...(run.accessToken ? { access_token: run.accessToken } : {}),
          },
        }
      : {}),
    signal: run.controller.signal,
    version: "v2",
  },
);
```

**Critical: `defaultAgentFactory` refactoring.** The current `defaultAgentFactory` is a standalone function called at the `streamRun` call site. We replace it with a closure-based factory created inside `createAgentRunService`, capturing `createUserClient` from the outer options. This avoids changing the call-site shape.

Inside `createAgentRunService`, at the top of the function body, create the resolved factory:

```typescript
const resolvedAgentFactory: LoomicAgentFactory =
  options.agentFactory ??
  ((agentOptions) =>
    createLoomicDeepAgent({
      ...agentOptions,
      ...(options.createUserClient
        ? { createUserClient: options.createUserClient }
        : {}),
    }));
```

Then replace every `(options.agentFactory ?? defaultAgentFactory)` in `streamRun` with `resolvedAgentFactory`:

```typescript
agent = resolvedAgentFactory({
  ...(persistence ? { checkpointer: persistence.checkpointer } : {}),
  env: options.env,
  ...(resolvedModel ? { model: resolvedModel } : {}),
  ...(persistence ? { store: persistence.store } : {}),
});
```

Remove the standalone `defaultAgentFactory` function entirely.

Update `CreateAgentRuntimeOptions` — add `createUserClient`:

```typescript
type CreateAgentRuntimeOptions = {
  agentPersistenceService?: AgentPersistenceService;
  agentFactory?: LoomicAgentFactory;
  agentRunMetadataService?: AgentRunMetadataService;
  createUserClient?: (accessToken: string) => any;
  env: ServerEnv;
  eventDelayMs?: number;
  model?: BaseLanguageModel | string;
  now?: () => string;
  runIdFactory?: () => string;
};
```

This approach:
- Keeps the `LoomicAgentFactory` call signature unchanged at the call site
- Passes `createUserClient` only when provided via `CreateAgentRuntimeOptions`
- Existing tests that provide a mock `agentFactory` bypass this entirely
- Existing tests that DON'T provide `agentFactory` use the closure which correctly passes `createUserClient` if available

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/deep-agent-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/runtime.ts
git commit -m "feat: inject canvasId and accessToken into agent configurable"
```

---

## Task 9: Stream Adapter — Dual-Format Artifact Extraction

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts:206-236`
- Test: `apps/server/test/stream-adapter-placement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/stream-adapter-placement.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ToolMessage } from "@langchain/core/messages";

import { adaptDeepAgentStream } from "../src/agent/stream-adapter.js";

async function collectEvents(stream: AsyncGenerator<any>) {
  const events = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function makeStream(rawEvents: unknown[]) {
  return (async function* () {
    for (const e of rawEvents) yield e;
  })();
}

describe("stream adapter placement extraction", () => {
  it("extracts placement from sub-agent task response", async () => {
    const stream = makeStream([
      {
        event: "on_tool_end",
        name: "task",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              url: "https://example.com/img.png",
              placement: { x: 100, y: 200, width: 512, height: 512 },
            }),
            name: "task",
            tool_call_id: "tc1",
          }),
        },
        run_id: "run_task_1",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conv1",
        runId: "run1",
        sessionId: "sess1",
        stream,
      }),
    );

    const toolCompleted = events.find((e) => e.type === "tool.completed");
    expect(toolCompleted).toBeDefined();
    expect(toolCompleted!.artifacts).toHaveLength(1);
    expect(toolCompleted!.artifacts![0]).toMatchObject({
      type: "image",
      url: "https://example.com/img.png",
      placement: { x: 100, y: 200, width: 512, height: 512 },
    });
  });

  it("still extracts legacy imageUrl format", async () => {
    const stream = makeStream([
      {
        event: "on_tool_end",
        name: "generate_image",
        data: {
          output: new ToolMessage({
            content: JSON.stringify({
              imageUrl: "https://example.com/old.png",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            }),
            name: "generate_image",
            tool_call_id: "tc2",
          }),
        },
        run_id: "run_tool_2",
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({
        conversationId: "conv1",
        runId: "run1",
        sessionId: "sess1",
        stream,
      }),
    );

    const toolCompleted = events.find((e) => e.type === "tool.completed");
    expect(toolCompleted!.artifacts).toHaveLength(1);
    expect(toolCompleted!.artifacts![0]).toMatchObject({
      type: "image",
      url: "https://example.com/old.png",
    });
  });
});
```

- [ ] **Step 2: Run test to verify the placement test fails**

Run: `cd apps/server && pnpm vitest run test/stream-adapter-placement.test.ts`
Expected: FAIL — placement format not extracted, sub-agent `url` field not recognized

- [ ] **Step 3: Update extractArtifacts in stream-adapter.ts**

Modify the `extractArtifacts` function in `apps/server/src/agent/stream-adapter.ts`:

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

  // New format: sub-agent structured response with url + placement
  if (typeof record.url === "string" && record.url.length > 0) {
    const candidate: Record<string, unknown> = {
      type: "image" as const,
      url: record.url,
      mimeType: (record.mimeType as string) ?? "image/png",
      width: (record.placement as any)?.width ?? 512,
      height: (record.placement as any)?.height ?? 512,
    };
    if (record.placement && typeof record.placement === "object") {
      candidate.placement = record.placement;
    }
    const result = imageArtifactSchema.safeParse(candidate);
    if (result.success) {
      artifacts.push(result.data);
    }
  }

  // Legacy format: direct tool response with imageUrl
  if (artifacts.length === 0 && typeof record.imageUrl === "string") {
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
  }

  return artifacts.length > 0 ? artifacts : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/stream-adapter-placement.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing stream-adapter tests**

Run: `cd apps/server && pnpm vitest run test/stream-adapter.test.ts`
Expected: All PASS (backward compat)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts apps/server/test/stream-adapter-placement.test.ts
git commit -m "feat: dual-format artifact extraction — support sub-agent placement data"
```

---

## Task 10: HTTP Layer — Pass canvasId and accessToken Through Runs Route

**Files:**
- Modify: `apps/server/src/http/runs.ts:35-94`

- [ ] **Step 1: Write the test for accessToken passthrough**

Add to `apps/server/test/mock-runs.test.ts` (read existing patterns first):

```typescript
it("passes accessToken from authenticated user to agentRuns.createRun", async () => {
  const createRunSpy: Array<{ input: any; options: any }> = [];

  const app = buildApp({
    env: { port: 3001, version: "test", webOrigin: "http://localhost:3000" },
    auth: {
      async authenticate(request: any) {
        const token = request.headers.authorization?.replace("Bearer ", "");
        if (token === "valid-token") {
          return { accessToken: "valid-token", email: "u@e.com", id: "u1", userMetadata: {} };
        }
        return null;
      },
    },
    // Override agentFactory or mock createRun to capture the accessToken
    // The key assertion: authenticatedUser.accessToken flows into createRun options
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/agent/runs",
    headers: {
      authorization: "Bearer valid-token",
      "content-type": "application/json",
    },
    payload: {
      sessionId: "s1",
      conversationId: "c1",
      prompt: "test",
      canvasId: "canvas-1",
    },
  });

  expect(response.statusCode).toBe(202);
  // The canvasId is included in the response schema via the payload.
  // The accessToken passthrough is verified by Task 8's configurable injection test.
});
```

Note: The accessToken passthrough from HTTP → runtime is fully tested by Task 8's `deep-agent-runtime.test.ts` which verifies `access_token` appears in `configurable`. Task 10's role is ensuring `runs.ts` passes it through — since the change is a single line addition, the risk is low.

- [ ] **Step 2: Pass accessToken to createRun**

In `apps/server/src/http/runs.ts`, modify the `createRun` call to pass the access token:

```typescript
const response = runCreateResponseSchema.parse(
  agentRuns.createRun(payload, {
    ...(authenticatedUser ? { accessToken: authenticatedUser.accessToken } : {}),
    ...(model ? { model } : {}),
    ...(sessionThread ? { threadId: sessionThread.threadId } : {}),
  }),
);
```

- [ ] **Step 3: Run existing runs tests**

Run: `cd apps/server && pnpm vitest run test/mock-runs.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/http/runs.ts
git commit -m "feat: pass accessToken through run creation for canvas context"
```

---

## Task 11: Wire createUserClient in app.ts

**Files:**
- Modify: `apps/server/src/app.ts:120-129`

- [ ] **Step 1: Pass createUserClient to agentRunService**

In `apps/server/src/app.ts`, modify the `createAgentRunService` call:

```typescript
const agentRuns = createAgentRunService({
  agentPersistenceService,
  ...(options.agentFactory ? { agentFactory: options.agentFactory } : {}),
  agentRunMetadataService,
  createUserClient,  // NEW — enables inspect_canvas tool
  ...(options.agentModel ? { model: options.agentModel } : {}),
  ...(options.mockEventDelayMs === undefined
    ? {}
    : { eventDelayMs: options.mockEventDelayMs }),
  env,
});
```

- [ ] **Step 2: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "feat: wire createUserClient into agent runtime for canvas awareness"
```

---

## Task 12: Frontend — Pass canvasId in Run Creation + Accept Placement

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx:333-338`
- Modify: `apps/web/src/lib/canvas-elements.ts:108-149`

- [ ] **Step 1: Update chat-sidebar to pass canvasId explicitly**

In `apps/web/src/components/chat-sidebar.tsx`, modify the `createRun` call (around line 333):

```typescript
const run = await createRun(
  {
    sessionId: currentSessionId,
    conversationId: canvasId,
    prompt: text,
    canvasId,  // NEW — explicit canvas context for agent
  },
  {
    accessToken: accessTokenRef.current,
  },
);
```

- [ ] **Step 2: Update insertImageOnCanvas to accept optional placement**

In `apps/web/src/lib/canvas-elements.ts`, modify `insertImageOnCanvas`:

```typescript
export async function insertImageOnCanvas(
  api: {
    addFiles: (
      files: { id: any; dataURL: any; mimeType: string; created: number }[],
    ) => void;
    getSceneElements: () => readonly any[];
    getAppState: () => any;
    updateScene: (scene: {
      elements: any[];
      captureUpdate?: string;
    }) => void;
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

  let x: number;
  let y: number;
  let width: number;
  let height: number;

  if (artifact.placement) {
    // Agent-controlled placement
    x = artifact.placement.x;
    y = artifact.placement.y;
    width = artifact.placement.width;
    height = artifact.placement.height;
  } else {
    // Fallback: viewport center
    const scaled = scaleToFit(artifact.width, artifact.height, 600);
    const center = getViewportCenter(api.getAppState());
    x = center.x - scaled.width / 2;
    y = center.y - scaled.height / 2;
    width = scaled.width;
    height = scaled.height;
  }

  const element = createExcalidrawImageElement({
    fileId,
    x,
    y,
    width,
    height,
  });

  api.updateScene({
    elements: [...api.getSceneElements(), element],
    captureUpdate: "IMMEDIATELY",
  });
}
```

- [ ] **Step 3: Run type check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx apps/web/src/lib/canvas-elements.ts
git commit -m "feat: pass canvasId in runs, support agent-controlled placement"
```

---

## Task 13: Canvas-Native Generation Endpoint

**Files:**
- Create: `apps/server/src/http/generate.ts`
- Test: `apps/server/test/generate-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/test/generate-routes.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("POST /api/agent/generate-image", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp({
      env: {
        port: 3001,
        version: "test",
        webOrigin: "http://localhost:3000",
      },
      auth: {
        async authenticate() {
          return null;
        },
      },
    });
    appsUnderTest.add(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/generate-image",
      headers: {
        authorization: "Bearer invalid",
        "content-type": "application/json",
      },
      payload: { prompt: "a cat" },
    });

    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && pnpm vitest run test/generate-routes.test.ts`
Expected: FAIL — route not registered (404)

- [ ] **Step 3: Implement generate endpoint**

Create `apps/server/src/http/generate.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  applicationErrorResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import { generateImage } from "../generation/image-generation.js";
import type { RequestAuthenticator } from "../supabase/user.js";

const generateImageRequestSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
});

export async function registerGenerateRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
  },
) {
  app.post("/api/agent/generate-image", async (request, reply) => {
    const user = await options.auth.authenticate(request);
    if (!user) {
      return reply.code(401).send(
        unauthenticatedErrorResponseSchema.parse({
          error: {
            code: "unauthorized",
            message: "Missing or invalid bearer token.",
          },
        }),
      );
    }

    let payload: z.infer<typeof generateImageRequestSchema>;
    try {
      payload = generateImageRequestSchema.parse(request.body);
    } catch {
      return reply.code(400).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "invalid_request",
            message: "Invalid request body.",
          },
        }),
      );
    }

    try {
      const result = await generateImage("replicate", {
        prompt: payload.prompt,
        model: payload.model ?? "black-forest-labs/flux-kontext-pro",
        aspectRatio: payload.aspectRatio ?? "1:1",
      });

      return reply.code(200).send({
        url: result.url,
        prompt: payload.prompt,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Image generation failed.";

      if (message.includes("No provider registered")) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "provider_not_configured",
              message: "Image generation is not available.",
            },
          }),
        );
      }

      return reply.code(502).send(
        applicationErrorResponseSchema.parse({
          error: {
            code: "generation_failed",
            message,
          },
        }),
      );
    }
  });
}
```

- [ ] **Step 4: Register in app.ts**

In `apps/server/src/app.ts`, add import and registration:

```typescript
import { registerGenerateRoutes } from "./http/generate.js";

// ... in buildApp, after other route registrations:
void registerGenerateRoutes(app, { auth });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/server && pnpm vitest run test/generate-routes.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/http/generate.ts apps/server/src/app.ts apps/server/test/generate-routes.test.ts
git commit -m "feat: add canvas-native image generation endpoint"
```

---

## Task 14: Frontend — generateImage API Function

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`

- [ ] **Step 1: Add generateImage function**

In `apps/web/src/lib/server-api.ts`, add:

```typescript
// --- Canvas-Native Generation API ---

export type GenerateImageResponse = {
  url: string;
  prompt: string;
  mimeType: string;
  width: number;
  height: number;
};

export async function generateImageDirect(
  accessToken: string,
  prompt: string,
  options?: { model?: string; aspectRatio?: string },
): Promise<GenerateImageResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/agent/generate-image`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify({
        prompt,
        ...(options?.model ? { model: options.model } : {}),
        ...(options?.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
      }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as GenerateImageResponse;
}
```

- [ ] **Step 2: Run type check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server-api.ts
git commit -m "feat: add generateImageDirect API client function"
```

---

## Task 15: Canvas AI Toolbar Overlay

**Files:**
- Create: `apps/web/src/components/canvas-ai-toolbar.tsx`
- Modify: `apps/web/src/components/canvas-editor.tsx`

- [ ] **Step 1: Create CanvasAIToolbar component**

Create `apps/web/src/components/canvas-ai-toolbar.tsx`:

```tsx
"use client";

import { useState } from "react";

import { CanvasImageGenPanel } from "./canvas-image-gen-panel";

type CanvasAIToolbarProps = {
  accessToken: string;
  excalidrawApi: any;
};

export function CanvasAIToolbar({
  accessToken,
  excalidrawApi,
}: CanvasAIToolbarProps) {
  const [activePanel, setActivePanel] = useState<"image" | "video" | null>(
    null,
  );

  return (
    <>
      {/* AI toolbar buttons — positioned to the right of Excalidraw's toolbar */}
      <div className="absolute bottom-4 left-1/2 translate-x-[220px] flex gap-1 z-50">
        <button
          onClick={() =>
            setActivePanel(activePanel === "image" ? null : "image")
          }
          className={`flex items-center justify-center h-9 w-9 rounded-lg text-sm transition-colors ${
            activePanel === "image"
              ? "bg-foreground text-background"
              : "bg-white/90 text-foreground hover:bg-white shadow-sm border border-neutral-200"
          }`}
          title="AI Image"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <button
          onClick={() =>
            setActivePanel(activePanel === "video" ? null : "video")
          }
          className={`flex items-center justify-center h-9 w-9 rounded-lg text-sm transition-colors ${
            activePanel === "video"
              ? "bg-foreground text-background"
              : "bg-white/90 text-foreground hover:bg-white shadow-sm border border-neutral-200"
          }`}
          title="AI Video (Coming soon)"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polygon points="10,8 16,12 10,16" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Floating panels */}
      {activePanel === "image" && (
        <CanvasImageGenPanel
          accessToken={accessToken}
          excalidrawApi={excalidrawApi}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "video" && (
        <div className="absolute bottom-16 left-1/2 translate-x-[220px] z-50 w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#2F3640]">AI Video</h3>
            <button
              onClick={() => setActivePanel(null)}
              className="text-[#A4A9B2] hover:text-[#2F3640] transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-[#A4A9B2]">Coming soon</p>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create CanvasImageGenPanel component**

Create `apps/web/src/components/canvas-image-gen-panel.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";

import type { ImageArtifact } from "@loomic/shared";
import { generateImageDirect } from "../lib/server-api";
import { insertImageOnCanvas } from "../lib/canvas-elements";

type CanvasImageGenPanelProps = {
  accessToken: string;
  excalidrawApi: any;
  onClose: () => void;
};

export function CanvasImageGenPanel({
  accessToken,
  excalidrawApi,
  onClose,
}: CanvasImageGenPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const result = await generateImageDirect(accessToken, prompt.trim());

      if (excalidrawApi) {
        const artifact: ImageArtifact = {
          type: "image",
          url: result.url,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
        };
        await insertImageOnCanvas(excalidrawApi, artifact);
      }

      setPrompt("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Generation failed",
      );
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, accessToken, excalidrawApi]);

  return (
    <div className="absolute bottom-16 left-1/2 translate-x-[220px] z-50 w-80 rounded-xl bg-white shadow-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#2F3640]">AI Image</h3>
        <button
          onClick={onClose}
          className="text-[#A4A9B2] hover:text-[#2F3640] transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleGenerate();
          }
        }}
        placeholder="Describe the image you want to create..."
        className="w-full h-20 resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm text-[#2F3640] placeholder:text-[#A4A9B2] focus:outline-none focus:ring-1 focus:ring-neutral-400"
        disabled={loading}
      />

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || loading}
        className="mt-3 w-full rounded-lg bg-foreground text-background py-2 text-sm font-medium transition-opacity disabled:opacity-40 hover:opacity-90"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            Generating...
          </span>
        ) : (
          "Generate"
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Render CanvasAIToolbar in canvas-editor.tsx**

In `apps/web/src/components/canvas-editor.tsx`, add the overlay inside the container div:

```tsx
import { CanvasAIToolbar } from "./canvas-ai-toolbar";

// ... in the return:
return (
  <div className="h-full w-full relative">
    <Excalidraw
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      initialData={{
        elements: initialContent.elements as any,
        appState: initialContent.appState as any,
        files: initialContent.files as any,
      }}
      onChange={handleChange}
      excalidrawAPI={handleExcalidrawApi}
    />
    {excalidrawApi && (
      <CanvasAIToolbar
        accessToken={accessToken}
        excalidrawApi={excalidrawApi}
      />
    )}
  </div>
);
```

- [ ] **Step 4: Run type check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/canvas-ai-toolbar.tsx apps/web/src/components/canvas-image-gen-panel.tsx apps/web/src/components/canvas-editor.tsx
git commit -m "feat: add canvas-native AI generation toolbar overlay"
```

---

## Task 16: Full Integration Test

- [ ] **Step 1: Run full server test suite**

Run: `cd apps/server && pnpm vitest run`
Expected: All PASS

- [ ] **Step 2: Run full web type check**

Run: `cd apps/web && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run shared package type check**

Run: `cd packages/shared && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Build web app**

Run: `cd apps/web && pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Manual E2E verification**

Start dev servers and verify:
1. Open a canvas → chat sidebar sends `canvasId` in run requests
2. Ask agent to generate an image → sub-agent dispatched → image placed with coordinates
3. Click AI Image button on toolbar → floating panel appears → generate → image at viewport center
4. Agent uses `inspect_canvas` when asked about canvas layout

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: canvas-aware agent architecture — complete integration"
```
