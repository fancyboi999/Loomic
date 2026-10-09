# Langfuse 链路监控接入分析

## 结论

一次用户 Agent run 对应一条 trace，Pi 模型调用与工具调用是子 observation，图片和视频 Worker 任务按同一 run 关联。观测代码集中在 `apps/server/src/observability/langfuse.ts`，业务工具不直接依赖 Langfuse。

当前工作区已加入独立观测模块和 Agent→PGMQ→Worker 的 trace context 传递；本文同时记录设计依据与验收边界。2026-10-09 已在 Langfuse Cloud 测试项目验证真实 Pi Agent 的“模型→文件工具→模型”完整循环，以及独立进程的工具/Worker 子观测入库。

## 接入前的链路与缺口

| 链路 | 当前代码 | 可记录的事实 |
| --- | --- | --- |
| 用户请求与运行 ID | `apps/server/src/agent/runtime.ts` | `runId`、`sessionId`、`threadId`、`canvasId`、`userId`，以及最终完成、失败、取消状态 |
| Pi Agent | `apps/server/src/agent/pi-agent.ts` | `Agent.subscribe()` 的 `message_start/end`、`tool_execution_start/end`、`agent_end` 等事件 |
| 模型用量 | Pi assistant message 的 `usage` | 输入、输出、缓存、推理 token；`usage.cost` 是 SDK 估算，不能当供应商最终账单 |
| 异步生成 | `apps/server/src/features/jobs/job-service.ts` 与 `apps/server/src/worker.ts` | `jobId`、任务类型、Worker 尝试次数和终态；当前 PGMQ 消息带 `session_id`，没有 `run_id` 或 trace context |
| 前端事件 | `apps/server/src/agent/pi-stream-adapter.ts` | 面向 UI 的流事件；它不是完整模型/Worker 观测源 |

## 实现落点

1. **独立观测模块。** `apps/server/src/observability/langfuse.ts` 初始化 OTel/Langfuse，并暴露 `createAgentTrace()`、`createJobTrace()` 和 `getRunTraceparent()`。只有此文件导入 Langfuse SDK。凭据缺失时返回空操作对象，Agent 和 Worker 的业务结果保持不变；凭据不完整时在首次使用时明确记录配置错误。
2. **稳定关联字段。** 每个 run 记录 `externalTraceId=runId`、`userId`、`sessionId=canvasId`、`metadata.sessionId`（聊天会话）、`threadId` 和模型 ID。`canvasId` 为空时用聊天 `sessionId` 作为 Langfuse session。不要将访问令牌、API key、签名 URL 或图片 base64 放入 trace。
3. **记录 Pi 子观测。** `turn_start/end` 建立 turn 层级，每轮的模型和工具节点挂在对应 turn 下；每次模型调用保存脱敏后的 Pi 输入 transcript。assistant `message_start/end` 对应 generation，写实际模型、provider、停止原因、工具调用内容，以及输入、输出、缓存和推理 token 与费用拆分；`tool_execution_start/end` 按 `toolCallId` 配对，写工具名、`durationMs`、`isError` 和安全的结果摘要。root 同时显示最终答复，并用模型、运行结果及图片/视频工具标签支持筛选。Agent 的异常、取消和成功均结束 root；观测写入或 flush 失败只告警，不改变用户请求状态。
4. **覆盖异步任务。** `createJob` 将 `runId` 和 `traceparent` 放入 PGMQ 消息，Worker 用 parent span context 创建子观测，记录 `jobId`、任务类型、尝试次数和终态。业务库中的 job 仍以 `jobId` 为权威 ID；观测字段不参与业务状态判断。
5. **收尾。** API 和 Worker 在首次有观测任务时各自初始化 SDK；Agent run 和 Worker job 结束时进行最多八秒的有界 flush。观测网络故障不会阻断生成，但进程被强制终止时仍可能丢失尚未导出的 span。

当前依赖包括 `@langfuse/otel`、`@langfuse/tracing` 5.0.1，`@opentelemetry/api` 1.9.x，`@opentelemetry/sdk-node` 0.213.x。

## 数据与验收边界

- 输入/输出只保存脱敏后的有限长度文本。模型输入中的图片块仅记录 MIME 类型；工具参数中的签名 URL、Authorization、密钥、base64 必须剔除。供应商错误先经过现有错误清洗逻辑。
- Langfuse 的模型 token 与费用来自 Pi 返回值；图片、视频的积分扣费是业务账本，单独记录元数据，不合并成模型 token 成本。
- 单测已覆盖模型/工具事件配对、脱敏、无配置空操作、Langfuse 发送失败不影响 Agent、`runId`/trace context 进入 PGMQ 消息及 Worker 子 span 的父级上下文。尚未覆盖真实 Worker 重试。
- 真实 Pi Agent 使用 Gemini 2.5 Flash 读取临时文件后，Langfuse 页面在同一条 trace 下依次显示 `loomic-agent → model → read_file → model`：两次模型输入、第一次模型的工具调用、工具参数/结果、最终答复、耗时、token 和模型费用。核验用 runId 为 `langfuse-real-tool-1791545660499`，trace ID 为 `157e09dcb3d8c36a5717fde34fde3756`。另一条测试 trace 的 `generate_image` 工具与独立进程创建的 `job:image_generation` 子观测也显示在同一 trace 下。测试没有提交真实 PGMQ 媒体任务，因此不能据此断言实际 Worker 重试链路已经在线验收。

## 与 Carmack 导出样本对照

用户提供的 `trace-767581381f3afc6fa9f8dd81f3906e8a.json` 包含 1 个根 span、6 个 turn、6 个 generation 和 5 个工具节点；generation 挂在对应 turn 下，并带输入/输出/缓存 token 及各项费用。trace 还有任务结果、模型和实验路由标签与元数据。该导出文件没有 observation 的 input/output 正文字段，因此不能仅凭此文件比较两边的提示词或工具结果展示完整度。

Loomic 已补齐适用的 turn 层级、Pi 实际返回的 token/费用拆分和稳定筛选标签。Carmack 的构建、质量实验、模型路由和配额字段属于其业务实现，Loomic 没有对应事件来源，不复制空字段。新增字段的真实验收 runId 是 `langfuse-real-tool-1791546263587`，trace ID 是 `7d13570834ddad2d2cba84ca416dbcb2`：页面显示 `loomic-agent → turn-1（model、read_file）→ turn-2（model）`，最终答复为“蓝色鲸鱼-2026”。实际图片/视频 Worker 的生产链路仍需单独验收。
