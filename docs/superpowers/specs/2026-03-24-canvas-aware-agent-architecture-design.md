# Canvas-Aware Agent Architecture Design

> Date: 2026-03-24
> Status: Approved
> Depends on: deepagents-supabase-thread-persistence (merged)

## Problem

Loomic's current agent is a single-agent setup with a generic one-line system prompt, no canvas awareness, and client-side fixed-center image placement. The agent cannot see what's on the canvas, cannot decide where to place generated content, and lacks product identity. Additionally, users have no way to trigger AI generation directly from the canvas without going through chat.

## Goals

1. Give the agent a product identity (Loomic persona — cute, lively, helpful)
2. Enable canvas awareness via `inspect_canvas` tool
3. Adopt sub-agent architecture (main agent + generation sub-agents)
4. Let the agent control element placement on canvas (return coordinates)
5. Add canvas-native AI generation buttons (bypass chat for quick generation)

## Non-Goals

- Multi-model selection UI (deferred — only one model per type currently)
- Real-time canvas sync via WebSocket (use existing save/load pattern)
- Agent autonomously watching canvas changes (on-demand inspection only)
- Modifying Excalidraw's internal toolbar (not supported by their API)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Canvas Page (Web)                      │
│                                                           │
│  ┌──────────────────────┐  ┌───────────────────────────┐ │
│  │     Excalidraw        │  │     Chat Sidebar          │ │
│  │                       │  │                           │ │
│  │  ┌─────────────────┐  │  │  User ↔ Loomic Agent     │ │
│  │  │ CanvasAIToolbar  │  │  │                           │ │
│  │  │ [🖼️] [🎬]       │  │  │  Agent returns artifacts  │ │
│  │  └─────────────────┘  │  │  with placement params    │ │
│  │                       │  │                           │ │
│  │  ┌─────────────────┐  │  └───────────────────────────┘ │
│  │  │ ImageGenPanel    │  │                               │
│  │  │ (floating)       │  │                               │
│  │  └─────────────────┘  │                               │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Server                                │
│                                                          │
│  POST /api/agent/runs { prompt, sessionId, canvasId }    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Main Agent (Loomic)                                │  │
│  │  System prompt: product persona + canvas-aware      │  │
│  │  Tools: inspect_canvas, project_search, task        │  │
│  │                                                      │  │
│  │  ┌──────────────────┐  ┌──────────────────────────┐ │  │
│  │  │ inspect_canvas   │  │ task (deepagents built-in)│ │  │
│  │  │ → reads canvas   │  │ → spawns sub-agents      │ │  │
│  │  │   from Supabase  │  │                          │ │  │
│  │  └──────────────────┘  └──────────┬───────────────┘ │  │
│  │                                    │                 │  │
│  │                    ┌───────────────┼────────────┐    │  │
│  │                    ▼               ▼            │    │  │
│  │            ┌──────────────┐ ┌──────────────┐   │    │  │
│  │            │ image_generate│ │video_generate │   │    │  │
│  │            │ sub-agent    │ │ sub-agent    │   │    │  │
│  │            │              │ │              │   │    │  │
│  │            │ tools:       │ │ tools:       │   │    │  │
│  │            │ generate_img │ │ generate_vid │   │    │  │
│  │            └──────────────┘ └──────────────┘   │    │  │
│  │                                                │    │  │
│  └────────────────────────────────────────────────┘    │  │
└─────────────────────────────────────────────────────────┘
```

---

## Part A: Agent Core Restructure

### A1. Main Agent — Loomic Persona

**System prompt:**

```
你是 Loomic，一个可爱活泼、乐于助人的 AI 设计助手，生活在 Loomic 创意画布中 ✨

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
- 默认图片尺寸建议 512×512，根据画布内容适当调整
```

**File:** `apps/server/src/agent/prompts/loomic-main.ts`

**Main agent tools:** `inspect_canvas`, `project_search` (existing), plus deepagents' built-in `task` tool for sub-agent dispatch.

**Removed from main agent:** `image_generate`, `video_generate` — moved to sub-agents.

### A2. Sub-Agent Definitions

**image_generate sub-agent:**

```typescript
{
  name: "image_generate",
  description: "Generate an image based on a creative description. Returns the image URL and suggested canvas placement coordinates.",
  systemPrompt: `You are an image generation specialist. Given a description and optional canvas context, generate an image and return structured placement data.

Always return a JSON response:
{
  "url": "<generated image URL>",
  "placement": { "x": <number>, "y": <number>, "width": <number>, "height": <number> }
}

If canvas context is provided in the task description, use it to avoid overlapping with existing elements.`,
  tools: [createImageGenerateTool(...)],
  responseFormat: imageGenerateResponseSchema  // Wrapped via deepagents' expected format
}
```

**video_generate sub-agent:** Same pattern, tool is `createVideoGenerateTool(...)`. Video generation infrastructure status is TBD — if the provider is not configured, the sub-agent definition is still registered but returns a clear error message ("Video generation is not available yet") so the main agent can inform the user.

**Canvas context passing strategy:** The main agent is responsible for calling `inspect_canvas` BEFORE dispatching a generation task. It includes the relevant canvas state summary in the `task` tool's `description` parameter (e.g., "Generate a coffee poster. Canvas context: 2 elements exist at x:100,y:200 and x:600,y:200"). The sub-agent does NOT have access to `inspect_canvas` — this is intentional to keep sub-agents focused and stateless. Trade-off: canvas state in the task description is a snapshot; if the user adds elements during generation, the sub-agent's context is stale. This is acceptable because generation takes seconds, not minutes.

**File:** `apps/server/src/agent/sub-agents.ts`

### A3. inspect_canvas Tool

**Purpose:** Let the agent see what's on the canvas without polluting context with full state on every message.

**Interface:**

```typescript
inspect_canvas({
  detail_level: "summary" | "full",   // default: "summary"
  element_id?: string                  // query specific element
})
```

**Summary response (default):**

```json
{
  "canvasId": "canvas-1",
  "elementCount": 3,
  "boundingBox": { "minX": 0, "minY": 0, "maxX": 612, "maxY": 1000 },
  "viewport": { "zoom": 1, "backgroundColor": "#ffffff" },
  "elements": [
    { "id": "elem-1", "type": "image", "x": 100, "y": 200, "width": 512, "height": 512 },
    { "id": "elem-2", "type": "text", "x": 100, "y": 750, "text": "COFFEE", "fontSize": 48 },
    { "id": "elem-3", "type": "rectangle", "x": 0, "y": 0, "width": 800, "height": 1000 }
  ]
}
```

`boundingBox` is computed from all elements, making it easy for the agent to calculate "below all content" or "next to existing content" without iterating.

**Full response / element_id query:** Returns complete element properties (fill, stroke, font, opacity, angle, etc.).

**Implementation:**

1. Tool reads `canvasId` and `accessToken` from LangChain's `RunnableConfig.configurable`:
   ```typescript
   // in inspect-canvas.ts
   export function createInspectCanvasTool(deps: {
     createUserClient: (accessToken: string) => UserSupabaseClient;
   }) {
     return tool(
       async (input, config) => {
         const { canvasId, accessToken } = config?.configurable ?? {};
         if (!canvasId || !accessToken) {
           return JSON.stringify({ error: "no_canvas_context" });
         }
         const client = deps.createUserClient(accessToken);
         const { data } = await client
           .from("canvases")
           .select("content")
           .eq("id", canvasId)
           .single();
         // format based on input.detail_level ...
       },
       { name: "inspect_canvas", schema: inspectCanvasSchema, description: "..." }
     );
   }
   ```

2. `runtime.ts` injects `canvasId` and `accessToken` into `configurable` when calling `agent.streamEvents()`:
   ```typescript
   // in runtime.ts streamRun()
   const config = {
     configurable: {
       thread_id: run.threadId,
       canvas_id: run.canvasId,        // NEW
       access_token: run.accessToken,   // NEW
     },
   };
   ```

3. Uses user-scoped Supabase client (via `createUserClient` factory injected at tool creation) to enforce RLS — the user can only inspect canvases they have access to.

4. Error responses:
   - canvasId missing → `{ error: "no_canvas_context", message: "This tool requires a canvas context." }`
   - Canvas not found / access denied → `{ error: "canvas_not_found", message: "Canvas not found or access denied." }`

**File:** `apps/server/src/agent/tools/inspect-canvas.ts`

### A4. canvas_id Injection into Agent Context

**Change chain:**

1. **`@loomic/shared` contracts:** Add `canvasId` to `RunCreateRequest` schema:
   ```typescript
   export const runCreateRequestSchema = z.object({
     prompt: z.string(),
     conversationId: z.string().optional(),
     sessionId: z.string(),
     canvasId: z.string().optional(),  // NEW
   });
   ```

2. **Frontend `chat-sidebar.tsx`:** Pass `canvasId` prop when creating a run.

3. **Server `runs.ts`:** Extract `canvasId` from request body, pass to `agentRuns.createRun()`.

4. **Server `runtime.ts`:** Store `canvasId` and `accessToken` in `RuntimeRunRecord`. Inject both into `configurable` when calling `agent.streamEvents()`:
   ```typescript
   const config = {
     configurable: {
       thread_id: run.threadId,
       canvas_id: run.canvasId,
       access_token: run.accessToken,
     },
   };
   for await (const event of agent.streamEvents(messages, config)) { ... }
   ```

### A5. Agent-Controlled Placement

**Sub-agent returns placement data → stream adapter extracts it → client places element.**

1. **Sub-agent response format:**
   ```typescript
   const imageGenerateResponseSchema = z.object({
     url: z.string().url(),
     placement: z.object({
       x: z.number(),
       y: z.number(),
       width: z.number().default(512),
       height: z.number().default(512),
     }),
   });
   ```

2. **`stream-adapter.ts`:** The `task` tool's `on_tool_end` event contains the sub-agent's structured response as the tool output string. The adapter parses this JSON and extracts both the image URL and placement data:
   ```typescript
   // Event path: on_tool_end for tool named "task"
   // event.data.output = '{"url":"https://...","placement":{"x":100,"y":200,"width":512,"height":512}}'

   // In extractArtifacts, handle both legacy format (imageUrl from direct tool)
   // and new format (url + placement from sub-agent task response)
   if (parsed.url && parsed.placement) {
     // Sub-agent structured response
     artifacts.push({
       type: "image",
       url: parsed.url,
       placement: parsed.placement,
     });
   } else if (parsed.imageUrl) {
     // Legacy direct tool response (backward compat)
     artifacts.push({ type: "image", url: parsed.imageUrl });
   }
   ```
   Emits as image artifact event with optional placement:
   ```typescript
   { type: "image_artifact", url: "...", placement: { x: 100, y: 200, width: 512, height: 512 } }
   ```

3. **`@loomic/shared` contracts:** Extend `ImageArtifact` type:
   ```typescript
   export type ImageArtifact = {
     url: string;
     prompt?: string;
     placement?: { x: number; y: number; width: number; height: number };
   };
   ```

4. **Frontend `canvas-elements.ts` — `insertImageOnCanvas()`:**
   - If `artifact.placement` exists → use those coordinates
   - If not → fallback to current viewport-center behavior

---

## Part B: Canvas-Native AI Generation

### B1. CanvasAIToolbar Component

**Position:** Overlaid on top of Excalidraw, visually adjacent to the native toolbar (right side). Uses absolute positioning relative to the canvas container.

**File:** `apps/web/src/components/canvas-ai-toolbar.tsx`

```tsx
<div className="absolute bottom-4 left-1/2 translate-x-[calc(50%+8px)] flex gap-1 z-50">
  <Button onClick={() => setPanel("image")} tooltip="AI Image">🖼️</Button>
  <Button onClick={() => setPanel("video")} tooltip="AI Video">🎬</Button>
</div>
```

**Positioning strategy:** CSS-based fixed positioning relative to the canvas container. The buttons are centered at the bottom, offset to the right of center to sit visually adjacent to Excalidraw's toolbar. No DOM coupling to Excalidraw internals — pure CSS `absolute` positioning with `z-index` layering.

### B2. ImageGenPanel (Floating Panel)

**File:** `apps/web/src/components/canvas-image-gen-panel.tsx`

**UI:**
- Floating card anchored to the AI toolbar button
- Prompt textarea
- Generate button (with loading state)
- Close button

**Flow:**
1. User types prompt, clicks Generate
2. Panel calls server API directly: `POST /api/agent/generate-image` (new lightweight endpoint — no agent, just image generation service)
3. Returns `{ url }` on success
4. Calls `insertImageOnCanvas(api, { url })` → placed at viewport center
5. Panel closes or stays open for next generation

**New server endpoint:** `POST /api/agent/generate-image`
- Authenticated (reuses existing auth middleware)
- Calls the image generation provider directly (same provider the sub-agent uses)
- Returns `{ url, prompt }` — no placement (user manually positions)
- Error responses:
  - Provider not configured (no API token) → `400 { error: { code: "provider_not_configured", message: "Image generation is not available." } }`
  - Generation failed → `502 { error: { code: "generation_failed", message: "..." } }`
  - Rate limiting deferred to future iteration

### B3. VideoGenPanel

Same pattern as ImageGenPanel. `POST /api/agent/generate-video`.

**Status: Deferred.** Video generation provider readiness is TBD. The VideoGenPanel UI will be created with a "Coming soon" placeholder. The endpoint and sub-agent are defined but return an explicit error if the provider is not configured. This avoids blocking the rest of the implementation.

---

## File Changes Summary

### New files
| File | Purpose |
|---|---|
| `apps/server/src/agent/prompts/loomic-main.ts` | Main agent system prompt |
| `apps/server/src/agent/sub-agents.ts` | Sub-agent definitions (image, video) |
| `apps/server/src/agent/tools/inspect-canvas.ts` | inspect_canvas tool |
| `apps/server/src/http/generate.ts` | Canvas-native generation endpoints |
| `apps/web/src/components/canvas-ai-toolbar.tsx` | AI toolbar overlay |
| `apps/web/src/components/canvas-image-gen-panel.tsx` | Image generation floating panel |
| `apps/web/src/components/canvas-video-gen-panel.tsx` | Video generation floating panel |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/contracts.ts` | Add `canvasId` to RunCreateRequest, extend ImageArtifact with placement |
| `apps/server/src/agent/deep-agent.ts` | Use new system prompt, register sub-agents, remove direct gen tools from main agent |
| `apps/server/src/agent/tools/index.ts` | Export inspect_canvas, restructure tool creation |
| `apps/server/src/agent/runtime.ts` | Pass canvasId through run context |
| `apps/server/src/agent/stream-adapter.ts` | Extract placement from sub-agent structured response |
| `apps/server/src/http/runs.ts` | Accept canvasId in run creation |
| `apps/server/src/app.ts` | Wire new generate endpoints, pass canvasId |
| `apps/web/src/components/chat-sidebar.tsx` | Pass canvasId when creating runs |
| `apps/web/src/components/canvas-editor.tsx` | Render CanvasAIToolbar overlay |
| `apps/web/src/lib/canvas-elements.ts` | Accept placement params in insertImageOnCanvas |
| `apps/web/src/lib/server-api.ts` | Add generateImage/generateVideo API calls |

---

## Testing Strategy

- **Unit tests:** inspect_canvas tool (mock Supabase), sub-agent definitions, placement extraction in stream adapter
- **Integration tests:** Full run with canvas context → sub-agent dispatch → placement artifact returned
- **Existing tests:** `canvasId` is optional in schemas, so existing tests pass without changes (backward compatible). New tests cover the canvasId-present path
- **Manual E2E:** Create canvas → generate image via chat → verify placement; generate via toolbar button → verify viewport center placement
