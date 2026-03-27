# WebSocket 通信架构 + Canvas Screenshot 工具设计

> Date: 2026-03-27
> Status: Draft
> Scope: 全面迁移 SSE → WebSocket，新增 canvas screenshot agent 工具

## 概述

当前 Loomic 的 agent 通过 `inspect_canvas` 工具获取画布元素的 JSON 结构数据，但无法"看到"画布的视觉效果。本设计新增 `screenshot_canvas` 工具，让 agent 能截取画布渲染图像，基于视觉信息辅助决策（布局美感、颜色搭配、空间关系等）。

同时，将现有 SSE 单向推送架构全面迁移为 WebSocket 双向通信，为截图 RPC 和未来更多前后端交互能力奠定基础。

## 动机

- **Agent 视觉能力缺失：** inspect_canvas 只返回坐标/属性 JSON，agent 无法感知视觉层级、颜色协调、布局美观度
- **SSE 单向通信限制：** 当前 Server→Client 单向推送，无法实现"服务端请求前端执行操作"的模式
- **长期基础设施：** WebSocket 双向通道是后续 agent-frontend 深度交互的基础能力

## 一、WebSocket 通信协议

### 1.1 连接端点

单一 WS 连接：`ws://host/api/ws?token=xxx`

- 替代现有 SSE `GET /api/agent/runs/:id/events`
- 认证通过 URL query 传 token，服务端在 upgrade 时校验
- 一个用户同时维护一个活跃 WS 连接

### 1.2 消息格式

所有消息为 JSON，按方向分三类：

#### Server → Client：推送事件（替代 SSE）

```typescript
{
  type: "event",
  event: "run.started" | "message.delta" | "tool.started" | "tool.completed"
       | "canvas.sync" | "run.completed" | "run.failed" | "run.canceled",
  runId: string,
  timestamp: string,
  payload: {
    // 与现有 StreamEvent 数据结构一致
    // message.delta: { delta, messageId }
    // tool.started: { toolName, toolCallId, input? }
    // tool.completed: { output, outputSummary, artifacts? }
    // 等等
  }
}
```

#### Server → Client：RPC 请求

```typescript
{
  type: "rpc.request",
  id: string,         // UUID，前端响应时回传用于匹配
  method: string,     // "canvas.screenshot" 等
  params: object      // 方法参数
}
```

#### Client → Server：命令 + RPC 响应

```typescript
// 发起 agent run（替代 POST /api/agent/runs）
// Server 收到后立即回复 command.ack 确认，后续通过 push events 推送 run 进展
{
  type: "command",
  action: "agent.run",
  payload: {
    canvasId: string,
    projectId: string,
    message: string,
    attachments?: Array<{ url: string, mimeType: string }>
  }
}

// Server 对 command 的确认回复
{
  type: "command.ack",
  action: "agent.run",
  payload: { runId: string, status: "accepted" }
}

// 取消 run（替代 POST /api/agent/runs/:id/cancel）
{
  type: "command",
  action: "agent.cancel",
  payload: { runId: string }
}

// RPC 响应
{
  type: "rpc.response",
  id: string,         // 匹配 rpc.request 的 id
  result?: object,    // 成功结果
  error?: string      // 错误信息
}
```

### 1.3 心跳保活

- Server 每 30s 发送 WebSocket ping frame
- Client 自动回复 pong（浏览器 WebSocket API 内置）
- Server 超过 60s 未收到 pong 则断开连接并清理资源

## 二、WebSocket 服务端架构

### 2.1 技术选型

使用 `@fastify/websocket`（基于 `ws` 库），与现有 Fastify 服务无缝集成。

### 2.2 ConnectionManager

```typescript
class ConnectionManager {
  private connections: Map<string, WebSocket>;       // userId → ws
  private pendingRPC: Map<string, PendingRPC>;       // rpcId → { resolve, reject, timer }

  // 连接管理
  register(userId: string, ws: WebSocket): void;
  remove(userId: string): void;
  get(userId: string): WebSocket | undefined;

  // RPC：发请求并等待前端响应（Promise + 超时）
  async rpc<T>(userId: string, method: string, params: object, timeout?: number): Promise<T>;

  // 推送事件（替代 SSE res.raw.write）
  push(userId: string, event: StreamEvent): void;

  // 处理收到的 client 消息
  handleMessage(userId: string, message: WSMessage): void;
}

interface PendingRPC {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
```

### 2.3 路由变更

| 现有路由 | 替换为 | 保留？ |
|----------|--------|--------|
| `POST /api/agent/runs` | WS command `agent.run` | 删除 |
| `GET /api/agent/runs/:id/events` (SSE) | WS push events | 删除 |
| `POST /api/agent/runs/:id/cancel` | WS command `agent.cancel` | 删除 |
| `GET /api/canvases/:id` | 不变 | 保留 |
| `PUT /api/canvases/:id` | 不变 | 保留 |
| `POST /api/agent/generate-image` | 不变 | 保留 |

仅迁移需要实时通信的 agent run 相关接口，纯 CRUD REST 接口保持不变。

### 2.4 Stream Adapter 改造

核心转换逻辑（LangChain streamEvents → Loomic StreamEvent）不变，仅改输出通道：

```typescript
// 现有：写入 SSE response
res.raw.write(`data: ${JSON.stringify(event)}\n\n`);

// 改为：通过 ConnectionManager 推送
connectionManager.push(userId, event);
```

`extractArtifacts()` 需扩展以支持 content block 数组格式（用于截图工具返回的多模态 ToolMessage）。

## 三、Screenshot Canvas 工具

### 3.1 Tool 定义

```typescript
{
  name: "screenshot_canvas",
  description: "Take a visual screenshot of the canvas to inspect layout, design quality, color harmony, and spatial relationships. Use this to visually verify your changes or understand the current canvas state.",
  parameters: z.object({
    mode: z.enum(["full", "region", "viewport"]).describe(
      "full: all elements; region: specific area; viewport: current user view"
    ),
    region: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }).optional().describe("Required when mode is 'region'"),
    max_dimension: z.number().default(1024).describe(
      "Max width or height in pixels. 512=low, 1024=medium, 2048=high quality"
    ),
  })
}
```

### 3.2 使用场景

Agent 自主决策——在操作画布前/后主动截图：
- 操作前：了解当前画布视觉状态
- 操作后：验证修改效果是否符合预期
- 布局检查：判断元素间距、对齐、重叠
- 设计评估：颜色搭配、视觉层级、整体美感

### 3.3 执行流程

```
1. Agent 调用 screenshot_canvas({ mode: "full", max_dimension: 1024 })
2. Server tool 通过 ConnectionManager.rpc() 发送 WS RPC 请求
   → { type: "rpc.request", id: "uuid", method: "canvas.screenshot", params: {...} }
3. Frontend 收到 RPC 请求：
   a. mode="full"     → exportToBlob({ elements: allElements })
   b. mode="region"   → exportToBlob({ elements: filteredByRegion, crop: region })
   c. mode="viewport" → exportToBlob({ 基于 scrollX/Y + viewport 尺寸计算 })
   d. max_dimension   → 映射为 exportToBlob 的 maxWidthOrHeight 参数
   e. files           → 传入 excalidrawAPI.getFiles() 确保嵌入图片被渲染
4. Frontend 上传 blob → Supabase Storage screenshots/{canvasId}/{timestamp}.png
5. Frontend 回传 RPC response → { url, width, height }
6. Server tool 构造带图片的 ToolMessage 返回给模型
```

### 3.4 ToolMessage 返回格式

```typescript
return new ToolMessage({
  content: [
    { type: "text", text: `Canvas screenshot captured (${width}x${height}, mode: ${mode})` },
    { type: "image", source_type: "url", url: screenshotUrl, mimeType: "image/png" }
  ],
  tool_call_id: toolCallId,
});
```

模型直接在工具返回的上下文中"看到"截图，作为正常的 tool result 处理。

### 3.5 Stream Adapter 多模态支持

当前 `extractArtifacts()` 只处理 JSON 字符串。需扩展以处理 ToolMessage content 为 array 的情况：

- 检测 content 是否为数组
- 从数组中提取 image content block 作为 artifact
- 文本部分作为 outputSummary 推送给前端

## 四、前端实现

### 4.1 WebSocket Hook

```typescript
// hooks/use-websocket.ts
function useWebSocket(token: string) {
  const ws = useRef<WebSocket>(null);
  const rpcHandlers = useRef<Map<string, RPCHandler>>();

  // 自动连接 + 断线重连（指数退避：1s → 2s → 4s → 8s → max 30s）
  // 推送事件通过 callback 分发
  // RPC 请求通过注册的 handler 分派

  return {
    send(command: WSCommand): void;
    on(eventType: string, cb: EventCallback): void;
    off(eventType: string, cb: EventCallback): void;
    registerRPC(method: string, handler: RPCHandler): void;
    connected: boolean;
  };
}
```

### 4.2 截图 RPC Handler

在 `canvas-editor.tsx` 中注册：

```typescript
registerRPC("canvas.screenshot", async (params) => {
  const { mode, region, max_dimension = 1024 } = params;

  let elements: ExcalidrawElement[];
  let exportArea: { x, y, width, height } | undefined;

  if (mode === "full") {
    elements = excalidrawAPI.getSceneElements();
  } else if (mode === "region") {
    elements = filterElementsByRegion(excalidrawAPI.getSceneElements(), region);
    exportArea = region;
  } else if (mode === "viewport") {
    const appState = excalidrawAPI.getAppState();
    // 根据 scrollX, scrollY, zoom, width, height 计算可见区域
    exportArea = computeViewportRegion(appState);
    elements = filterElementsByRegion(excalidrawAPI.getSceneElements(), exportArea);
  }

  const blob = await exportToBlob({
    elements,
    appState: { ...excalidrawAPI.getAppState(), exportBackground: true },
    maxWidthOrHeight: max_dimension,
    mimeType: "image/png",
    files: excalidrawAPI.getFiles(),
  });

  // 上传到 Supabase Storage
  const path = `screenshots/${canvasId}/${Date.now()}.png`;
  await supabase.storage.from("canvases").upload(path, blob);
  const { data: { publicUrl } } = supabase.storage.from("canvases").getPublicUrl(path);

  return { url: publicUrl, width, height };
});
```

### 4.3 SSE 消费者迁移

```typescript
// 现有：EventSource
const es = new EventSource(`/api/agent/runs/${runId}/events`);
es.onmessage = (e) => handleEvent(JSON.parse(e.data));

// 改为：WebSocket
ws.on("event", (event) => {
  if (event.runId === currentRunId) handleEvent(event);
});
```

消费逻辑（chat 消息渲染、工具状态展示、canvas.sync 刷新）完全保持不变，只换数据来源。

## 五、错误处理

### 5.1 连接层

- 断线自动重连，指数退避（1s → 2s → 4s → 8s → max 30s）
- 重连期间 RPC 请求直接返回错误，不阻塞 agent
- 心跳：server 每 30s ping，超时 60s 无 pong 断开清理

### 5.2 RPC 超时

- 截图 RPC 默认 10s 超时
- 超时后 tool 返回文本错误 `"Screenshot failed: browser not responding"`
- Agent 可选择跳过视觉检查继续工作

### 5.3 截图失败场景

| 场景 | 处理 |
|------|------|
| 用户关闭浏览器 | WS 断连，tool 返回连接错误 |
| exportToBlob 失败 | RPC response 携带 error 字段 |
| Storage 上传失败 | 回退为 base64 data URL 直接返回 |
| 截图过大 (>4MB) | 自动降低 max_dimension 重试一次 |

## 六、测试策略

### 6.1 单元测试

- **ConnectionManager：** 连接注册/移除、RPC 发送/超时/响应匹配、push 事件分发
- **screenshot_canvas tool：** 参数校验、RPC 调用 mock、ToolMessage 多模态构造
- **Stream adapter 改造：** content block 数组格式解析、artifact 提取

### 6.2 集成测试

- WS 连接生命周期：connect → authenticate → receive events → disconnect → reconnect
- 完整截图流程：tool 调用 → WS RPC → mock exportToBlob → 返回 URL → ToolMessage 带图片
- Agent run 全流程走 WS（替代 SSE）：command → 事件推送 → run 完成

### 6.3 E2E 验证

- 启动真实 dev 环境，浏览器打开画布
- 触发 agent 截图，验证模型能"看到"并描述画布内容
- 验证断线重连后截图仍可正常工作

## 七、文件变更范围

### 新增文件
- `apps/server/src/ws/connection-manager.ts` — WS 连接管理 + RPC 机制
- `apps/server/src/ws/handler.ts` — WS 路由注册 + 消息分发
- `apps/server/src/agent/tools/screenshot-canvas.ts` — 截图工具
- `apps/web/src/hooks/use-websocket.ts` — WS 客户端 hook
- `packages/shared/src/ws-protocol.ts` — 共享消息类型定义

### 修改文件
- `apps/server/src/agent/stream-adapter.ts` — 输出通道 SSE → WS push，多模态 content block 支持
- `apps/server/src/agent/tools/index.ts` — 注册 screenshot_canvas 工具
- `apps/server/src/agent/deep-agent.ts` — 注入 ConnectionManager 依赖
- `apps/server/src/agent/prompts/loomic-main.ts` — 系统提示词加入截图工具使用指导
- `apps/web/src/components/canvas-editor.tsx` — 注册截图 RPC handler
- `apps/web/src/components/chat-sidebar.tsx`（或对应组件）— SSE → WS 消费迁移
- `apps/web/src/lib/server-api.ts` — agent run 相关方法走 WS

### 删除文件
- `apps/server/src/http/sse.ts` — SSE 路由（被 WS 替代）

### 保留不动
- `apps/server/src/http/canvases.ts` — REST CRUD 不变
- `apps/server/src/http/generate.ts` — 直接图片生成不变
