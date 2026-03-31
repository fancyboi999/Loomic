import type { StructuredTool } from "@langchain/core/tools";
import type { BackendFactory, BackendProtocol } from "deepagents";

import type { ConnectionManager } from "../../ws/connection-manager.js";
import { createBrandKitTool } from "./brand-kit.js";
import { createInspectCanvasTool } from "./inspect-canvas.js";
import { createManipulateCanvasTool } from "./manipulate-canvas.js";
import {
  createImageGenerateTool,
  type PersistImageFn,
  type SubmitImageJobFn,
} from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createScreenshotCanvasTool } from "./screenshot-canvas.js";
import {
  createVideoGenerateTool,
  type SubmitVideoJobFn,
} from "./video-generate.js";
import { createPersistSandboxFileTool } from "./persist-sandbox-file.js";

export { createImageGenerateTool } from "./image-generate.js";
export { createVideoGenerateTool } from "./video-generate.js";
export { createInspectCanvasTool } from "./inspect-canvas.js";
export { createManipulateCanvasTool } from "./manipulate-canvas.js";

// ---------------------------------------------------------------------------
// deepagents 内置工具参考 (由 FilesystemMiddleware 自动注入)
// ---------------------------------------------------------------------------
//
// deepagents@1.8.4 通过 createFilesystemMiddleware 自动注入以下工具，
// 我们自定义的工具名称不能与这些冲突：
//
//   ls          — 列出目录内容
//   read_file   — 读取文件内容（支持 offset/limit）
//   write_file  — 写入文件
//   edit_file   — 编辑文件（find & replace）
//   glob        — 按模式匹配文件路径
//   grep        — 按正则搜索文件内容
//   execute     — 执行 shell 命令（仅 SandboxBackendProtocol 时可用）
//   task        — 分发子任务到 subagent
//   write_todos — 管理 TODO 列表
//
// 我们使用 LocalShellBackend 作为 CompositeBackend 的 default backend，
// 它实现了 SandboxBackendProtocol，因此 execute 工具自动可用。
// 代码执行无需额外自定义工具。
//
// CompositeBackend 路由互不干扰：
//   /workspace/  → StoreBackend (PostgresStore) — 文件持久化
//   /memories/   → StoreBackend (PostgresStore) — agent 记忆
//   /skills/     → FilesystemBackend            — 系统 skills
//   default      → LocalShellBackend            — execute + 临时文件
// ---------------------------------------------------------------------------

export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
    connectionManager?: ConnectionManager;
    persistImage?: PersistImageFn;
    sandboxDir?: string;
    submitImageJob?: SubmitImageJobFn;
    submitVideoJob?: SubmitVideoJobFn;
  },
) {
  const tools: StructuredTool[] = [
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps),
    createManipulateCanvasTool(deps),
    createImageGenerateTool({
      ...(deps.persistImage ? { persistImage: deps.persistImage } : {}),
      ...(deps.submitImageJob ? { submitImageJob: deps.submitImageJob } : {}),
    }),
    createVideoGenerateTool({
      ...(deps.submitVideoJob ? { submitVideoJob: deps.submitVideoJob } : {}),
    }),
    createPersistSandboxFileTool({
      createUserClient: deps.createUserClient,
      ...(deps.sandboxDir ? { sandboxDir: deps.sandboxDir } : {}),
    }),
    // execute 工具由 deepagents FilesystemMiddleware 自动注入，
    // 因为 CompositeBackend 的 default backend 是 LocalShellBackend。
    // 不需要在这里手动注册。
  ];
  if (deps.brandKitId) {
    tools.push(createBrandKitTool(deps, deps.brandKitId));
  }
  if (deps.connectionManager) {
    tools.push(createScreenshotCanvasTool({ connectionManager: deps.connectionManager }));
  }
  return tools;
}

/** @deprecated Use createMainAgentTools + sub-agents instead */
export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [
    createProjectSearchTool(backend),
    createImageGenerateTool(),
    createVideoGenerateTool(),
  ] as const;
}
