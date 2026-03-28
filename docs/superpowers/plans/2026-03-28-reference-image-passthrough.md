# Reference Image Passthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户上传的参考图片能完整传递到图片生成 API，让 LLM 根据用户意图选择哪些图片作为参考。

**Architecture:** 采用 Jaaz 项目验证过的双通道设计 —— base64 image content 让 LLM "看到" 图片（已有），XML text tag 让 LLM "引用" 图片的 assetId（新增）。LLM 把选中的 assetId 传给 `generate_image` 工具的 `inputImages` 参数，工具执行时从 configurable 中解析 assetId 到 base64 data URI，最终发给外部 API。

**Tech Stack:** TypeScript, LangChain/LangGraph configurable, Zod, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/agent/runtime.ts` | Modify | 构建 HumanMessage 时追加 XML `<input_images>` 标签 + 存 base64 data URI map 到 configurable |
| `apps/server/src/agent/tools/image-generate.ts` | Modify | 工具执行时从 configurable 解析 assetId → base64 data URI |
| `apps/server/src/agent/prompts/loomic-main.ts` | Modify | 系统提示词追加 IMAGE INPUT DETECTION 静态规则 |
| `apps/server/src/features/jobs/executors/image-generation.ts` | Modify | PGMQ executor 补上 `inputImages` 透传 |
| `apps/server/test/image-generate-tool.test.ts` | Modify | 新增 assetId 解析 + inputImages 传递测试 |
| `apps/server/test/reference-image-passthrough.test.ts` | Create | runtime 层 HumanMessage 构建 + configurable 注入测试 |

---

### Task 1: PGMQ Executor 补上 inputImages 透传

**Files:**
- Modify: `apps/server/src/features/jobs/executors/image-generation.ts:42-46`

这是最简单的独立 bug fix —— executor 从数据库读到了 `payload.input_images` 但调用 `generateImage()` 时丢弃了。

- [ ] **Step 1: 修复 executor 中缺失的 inputImages 传递**

```ts
// apps/server/src/features/jobs/executors/image-generation.ts:42-46
// 把:
const generated = await generateImage(providerName, {
  prompt: payload.prompt,
  model,
  ...(payload.aspect_ratio !== undefined ? { aspectRatio: payload.aspect_ratio } : {}),
});

// 改为:
const generated = await generateImage(providerName, {
  prompt: payload.prompt,
  model,
  ...(payload.aspect_ratio !== undefined ? { aspectRatio: payload.aspect_ratio } : {}),
  ...(payload.input_images?.length ? { inputImages: payload.input_images } : {}),
});
```

- [ ] **Step 2: 运行现有测试确认无回归**

Run: `cd apps/server && npx vitest run test/image-generate-tool.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/features/jobs/executors/image-generation.ts
git commit -m "fix: pass inputImages through PGMQ job executor to generateImage"
```

---

### Task 2: 系统提示词增加 IMAGE INPUT DETECTION 静态规则

**Files:**
- Modify: `apps/server/src/agent/prompts/loomic-main.ts`

在系统提示词中添加**静态规则**，告诉 agent 当用户消息中出现 `<input_images>` XML 标签时如何处理。注意这段内容完全静态，不影响 KV cache。

- [ ] **Step 1: 在 loomic-main.ts 的 `## 工具使用策略` 后添加参考图规则**

在 `## 工具使用策略` 段落之后、`## 画布截图` 段落之前插入:

```ts
## 参考图片处理
当用户消息中包含 \`<input_images>\` XML 标签时：
1. 解析 XML 中的 \`asset_id\` 属性，这些是用户上传的参考图片标识
2. 结合用户的文字描述，判断哪些图片需要作为参考传给 generate_image
3. 将选中的 asset_id 列表传入 generate_image 工具的 inputImages 参数，如 \`inputImages: ["asset_id_1"]\`
4. 不要自己编造 asset_id，只使用 XML 标签中提供的值
5. 如果用户明确指定了某张图（如"参考第一张"），只传对应的 asset_id
6. 如果用户笼统地说"参考我的图"，传入所有 asset_id
7. 选择支持参考图输入的模型（如 Flux Kontext、Nano Banana），不要用纯文生图模型（如 Imagen 4、Recraft V3）
```

- [ ] **Step 2: 运行 prompt 测试确认无回归**

Run: `cd apps/server && npx vitest run test/loomic-prompt.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/prompts/loomic-main.ts
git commit -m "feat: add IMAGE INPUT DETECTION instructions to system prompt"
```

---

### Task 3: runtime.ts — HumanMessage 追加 XML 标签 + configurable 注入 attachment map

**Files:**
- Modify: `apps/server/src/agent/runtime.ts:400-458`
- Create: `apps/server/test/reference-image-passthrough.test.ts`

这是核心改动：在构建 HumanMessage 时，除了现有的 base64 image content（让 LLM 看到图），还需要：
1. 在文本中追加 `<input_images>` XML 标签（让 LLM 知道 assetId）
2. 把 `{ assetId → base64 data URI }` map 存入 configurable（让工具能解析）

- [ ] **Step 1: 编写测试 — 验证 HumanMessage 文本中包含 XML 标签**

创建 `apps/server/test/reference-image-passthrough.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildUserMessage, buildAttachmentDataMap } from "../src/agent/runtime.js";

describe("buildUserMessage with attachments", () => {
  const fakeAttachments = [
    { assetId: "asset-001", url: "http://localhost:54321/storage/v1/object/public/test/img1.png", mimeType: "image/png" },
    { assetId: "asset-002", url: "http://localhost:54321/storage/v1/object/public/test/img2.jpg", mimeType: "image/jpeg" },
  ];

  it("appends <input_images> XML to prompt text when attachments exist", () => {
    const prompt = "参考我的模卡图生成一个模特照";
    const result = buildUserMessage(prompt, fakeAttachments);

    expect(result.text).toContain(prompt);
    expect(result.text).toContain('<input_images count="2">');
    expect(result.text).toContain('asset_id="asset-001"');
    expect(result.text).toContain('asset_id="asset-002"');
    expect(result.text).toContain('index="1"');
    expect(result.text).toContain('index="2"');
    expect(result.text).toContain("</input_images>");
  });

  it("returns plain prompt when no attachments", () => {
    const result = buildUserMessage("hello", []);
    expect(result.text).toBe("hello");
    expect(result.text).not.toContain("<input_images");
  });
});

describe("buildAttachmentDataMap", () => {
  it("maps assetId to base64 data URI", () => {
    // Simulate pre-downloaded base64 data
    const downloaded = [
      { assetId: "asset-001", mimeType: "image/png", base64: "iVBORw0KGgo=" },
      { assetId: "asset-002", mimeType: "image/jpeg", base64: "/9j/4AAQ=" },
    ];
    const map = buildAttachmentDataMap(downloaded);

    expect(map["asset-001"]).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(map["asset-002"]).toBe("data:image/jpeg;base64,/9j/4AAQ=");
  });

  it("returns empty map for empty input", () => {
    expect(buildAttachmentDataMap([])).toEqual({});
  });
});
```

- [ ] **Step 2: 运行测试，确认失败（函数尚未导出）**

Run: `cd apps/server && npx vitest run test/reference-image-passthrough.test.ts`
Expected: FAIL — `buildUserMessage` 和 `buildAttachmentDataMap` 不存在

- [ ] **Step 3: 实现 `buildUserMessage` 和 `buildAttachmentDataMap` 辅助函数**

在 `apps/server/src/agent/runtime.ts` 中，在文件顶部已有 import 之后，添加两个导出函数：

```ts
/**
 * Build the text portion of a user message, appending <input_images> XML
 * tags when attachments are present so the LLM can reference them by assetId.
 */
export function buildUserMessage(
  prompt: string,
  attachments: Array<{ assetId: string; url: string; mimeType: string }>,
): { text: string } {
  if (!attachments.length) return { text: prompt };

  const imageXml = attachments
    .map(
      (a, i) =>
        `<image index="${i + 1}" asset_id="${a.assetId}" mime_type="${a.mimeType}" />`,
    )
    .join("\n  ");

  const xml = `\n\n<input_images count="${attachments.length}">\n  ${imageXml}\n</input_images>`;
  return { text: prompt + xml };
}

/**
 * Build a lookup map from assetId to base64 data URI.
 * Stored in configurable so tools can resolve assetId references.
 */
export function buildAttachmentDataMap(
  downloaded: Array<{ assetId: string; mimeType: string; base64: string }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of downloaded) {
    map[d.assetId] = `data:${d.mimeType};base64,${d.base64}`;
  }
  return map;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/server && npx vitest run test/reference-image-passthrough.test.ts`
Expected: PASS

- [ ] **Step 5: 修改 `streamRun` 中的 HumanMessage 构建逻辑**

在 `runtime.ts` 的 `streamRun` 方法中（约第 400-458 行），修改 attachment 处理块：

将现有的:
```ts
const hasAttachments = run.attachments && run.attachments.length > 0;
let userMessage: HumanMessage;
if (hasAttachments) {
  const imageBlocks = await Promise.all(
    run.attachments!.map(async (a) => {
      try {
        const res = await fetch(a.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = a.mimeType || res.headers.get("content-type") || "image/png";
        const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
        return {
          type: "image" as const,
          source_type: "base64" as const,
          data: buf.toString("base64"),
          mime_type: mime,
        };
      } catch {
        return {
          type: "image" as const,
          source_type: "url" as const,
          url: a.url,
          mimeType: a.mimeType,
        };
      }
    }),
  );
  userMessage = new HumanMessage({
    content: [
      { type: "text" as const, text: run.prompt },
      ...imageBlocks,
    ],
  });
} else {
  userMessage = new HumanMessage(run.prompt);
}
```

替换为:
```ts
const hasAttachments = run.attachments && run.attachments.length > 0;
let userMessage: HumanMessage;
let attachmentDataMap: Record<string, string> = {};

if (hasAttachments) {
  // Download images and build parallel data structures:
  // 1. imageBlocks: base64 content parts for LLM vision
  // 2. downloaded: assetId → base64 mapping for tool resolution
  const downloaded: Array<{ assetId: string; mimeType: string; base64: string }> = [];
  const imageBlocks = await Promise.all(
    run.attachments!.map(async (a) => {
      try {
        const res = await fetch(a.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = a.mimeType || res.headers.get("content-type") || "image/png";
        const b64 = buf.toString("base64");
        downloaded.push({ assetId: a.assetId, mimeType: mime, base64: b64 });
        return {
          type: "image" as const,
          source_type: "base64" as const,
          data: b64,
          mime_type: mime,
        };
      } catch {
        return {
          type: "image" as const,
          source_type: "url" as const,
          url: a.url,
          mimeType: a.mimeType,
        };
      }
    }),
  );

  // Build XML text tags for LLM to reference by assetId
  const { text: enrichedPrompt } = buildUserMessage(run.prompt, run.attachments!);

  // Build assetId → data URI map for tool-level resolution
  attachmentDataMap = buildAttachmentDataMap(downloaded);

  userMessage = new HumanMessage({
    content: [
      { type: "text" as const, text: enrichedPrompt },
      ...imageBlocks,
    ],
  });
} else {
  userMessage = new HumanMessage(run.prompt);
}
```

- [ ] **Step 6: 把 attachmentDataMap 注入 configurable**

在同一文件中，修改 `stream = agent.streamEvents(...)` 调用，在 configurable 中添加 `user_attachment_map`:

将现有的:
```ts
configurable: {
  ...(run.threadId ? { thread_id: run.threadId } : {}),
  ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
  ...(run.accessToken ? { access_token: run.accessToken } : {}),
  ...(run.userId ? { user_id: run.userId } : {}),
},
```

改为:
```ts
configurable: {
  ...(run.threadId ? { thread_id: run.threadId } : {}),
  ...(run.canvasId ? { canvas_id: run.canvasId } : {}),
  ...(run.accessToken ? { access_token: run.accessToken } : {}),
  ...(run.userId ? { user_id: run.userId } : {}),
  ...(Object.keys(attachmentDataMap).length > 0
    ? { user_attachment_map: attachmentDataMap }
    : {}),
},
```

同时需要修改 configurable 的条件判断，因为现在 `attachmentDataMap` 也可能触发 configurable 块。把:
```ts
...(run.threadId || run.canvasId || run.accessToken || run.userId
```
改为:
```ts
...(run.threadId || run.canvasId || run.accessToken || run.userId || Object.keys(attachmentDataMap).length > 0
```

- [ ] **Step 7: 运行全部相关测试**

Run: `cd apps/server && npx vitest run test/reference-image-passthrough.test.ts test/deep-agent-runtime.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/agent/runtime.ts apps/server/test/reference-image-passthrough.test.ts
git commit -m "feat: inject attachment assetId XML tags and data URI map into agent context"
```

---

### Task 4: image-generate.ts — 工具执行层解析 assetId → base64 data URI

**Files:**
- Modify: `apps/server/src/agent/tools/image-generate.ts:242-275`
- Modify: `apps/server/test/image-generate-tool.test.ts`

当 LLM 调用 `generate_image(inputImages: ["asset-001"])` 时，工具需要从 configurable 的 `user_attachment_map` 中解析出实际的 base64 data URI。

- [ ] **Step 1: 编写测试 — 验证 assetId 被解析为 data URI**

在 `apps/server/test/image-generate-tool.test.ts` 底部追加新的 describe 块:

```ts
describe("generate_image tool with assetId resolution", () => {
  beforeEach(() => {
    clearProviders();
  });

  it("resolves assetId references to base64 data URIs from attachment map", async () => {
    let capturedInputImages: string[] | undefined;
    registerImageProvider(
      createMockProvider({
        generate: async (params) => {
          capturedInputImages = params.inputImages;
          return {
            url: "https://example.com/result.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          };
        },
      }),
    );

    const attachmentMap = {
      "asset-001": "data:image/png;base64,iVBORw0KGgo=",
      "asset-002": "data:image/jpeg;base64,/9j/4AAQ=",
    };

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test with reference",
        model: TEST_MODEL_ID,
        inputImages: ["asset-001"],
      },
      undefined,
      undefined,
      attachmentMap,
    );

    expect(result.error).toBeUndefined();
    expect(capturedInputImages).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });

  it("passes through non-assetId URLs unchanged", async () => {
    let capturedInputImages: string[] | undefined;
    registerImageProvider(
      createMockProvider({
        generate: async (params) => {
          capturedInputImages = params.inputImages;
          return {
            url: "https://example.com/result.png",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          };
        },
      }),
    );

    const result = await runImageGenerate(
      {
        title: "Test",
        prompt: "test with external url",
        model: TEST_MODEL_ID,
        inputImages: ["https://example.com/external.png"],
      },
      undefined,
      undefined,
      {},
    );

    expect(result.error).toBeUndefined();
    expect(capturedInputImages).toEqual(["https://example.com/external.png"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/server && npx vitest run test/image-generate-tool.test.ts`
Expected: FAIL — `runImageGenerate` 还不接受第4个参数

- [ ] **Step 3: 修改 `runImageGenerate` 签名，增加 `attachmentMap` 参数**

在 `apps/server/src/agent/tools/image-generate.ts` 中:

将:
```ts
export async function runImageGenerate(
  input: ImageGenerateInput,
  persistImage?: PersistImageFn,
  submitImageJob?: SubmitImageJobFn,
): Promise<ImageGenerateResult> {
```

改为:
```ts
export async function runImageGenerate(
  input: ImageGenerateInput,
  persistImage?: PersistImageFn,
  submitImageJob?: SubmitImageJobFn,
  attachmentMap?: Record<string, string>,
): Promise<ImageGenerateResult> {
```

- [ ] **Step 4: 在 `runImageGenerate` 函数体最顶部添加 assetId 解析逻辑**

在函数体开头（`if (submitImageJob)` 之前）插入:

```ts
  // Resolve assetId references in inputImages to base64 data URIs
  if (input.inputImages?.length && attachmentMap) {
    input = {
      ...input,
      inputImages: input.inputImages.map((ref) =>
        attachmentMap[ref] ?? ref,
      ),
    };
  }
```

这段逻辑：如果 `ref` 是 assetId 且存在于 map 中，替换为 data URI；否则原样保留（兼容外部 URL）。

- [ ] **Step 5: 修改 `createImageGenerateTool` 从 configurable 取 attachment map 并传给 `runImageGenerate`**

将 `createImageGenerateTool` 中的 tool callback:
```ts
return tool(
  async (input: ImageGenerateInput) => {
    return await runImageGenerate(
      input,
      deps?.persistImage,
      deps?.submitImageJob,
    );
  },
```

改为:
```ts
return tool(
  async (input: ImageGenerateInput, config) => {
    const attachmentMap =
      (config as any)?.configurable?.user_attachment_map as
        Record<string, string> | undefined;
    return await runImageGenerate(
      input,
      deps?.persistImage,
      deps?.submitImageJob,
      attachmentMap,
    );
  },
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd apps/server && npx vitest run test/image-generate-tool.test.ts`
Expected: 全部 PASS（包括新增的 assetId 解析测试）

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/agent/tools/image-generate.ts apps/server/test/image-generate-tool.test.ts
git commit -m "feat: resolve assetId references to base64 data URIs in generate_image tool"
```

---

### Task 5: 端到端验证

- [ ] **Step 1: 启动 dev 环境**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm dev`

- [ ] **Step 2: 在浏览器中测试完整流程**

1. 打开 Loomic canvas 页面
2. 在 chat 中上传一张参考图
3. 输入"参考我的图 生成一个公园散步的模特照"
4. 观察 agent 是否：
   - 在 `generate_image` 调用中包含 `inputImages: ["<assetId>"]`
   - 选择了支持参考图的模型（如 Flux Kontext Pro）
5. 查看服务端日志确认 base64 data URI 被正确传递给 Replicate API

- [ ] **Step 3: 测试多图场景**

1. 上传 2-3 张图
2. 输入"参考第一张图生成一个类似风格的海报"
3. 确认 agent 只传了第一张的 assetId，而非全部

- [ ] **Step 4: 运行全量测试确认无回归**

Run: `cd apps/server && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 5: Commit all changes**

```bash
git add -A
git commit -m "feat: complete reference image passthrough from chat to image generation API"
```
