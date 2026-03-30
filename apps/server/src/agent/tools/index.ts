import type { StructuredTool } from "@langchain/core/tools";
import type { BackendFactory, BackendProtocol } from "deepagents";

import type { ConnectionManager } from "../../ws/connection-manager.js";
import { createBrandKitTool } from "./brand-kit.js";
import {
  createExecuteCodeTool,
  type SubmitCodeExecutionFn,
} from "./execute-code.js";
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

export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
    connectionManager?: ConnectionManager;
    persistImage?: PersistImageFn;
    sandboxDir?: string;
    submitCodeExecution?: SubmitCodeExecutionFn;
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
    // Custom execute tool for production (PGMQ-based code execution).
    // In dev mode, deepagents' built-in execute from LocalShellBackend takes precedence.
    ...(deps.submitCodeExecution
      ? [createExecuteCodeTool({ submitCodeExecution: deps.submitCodeExecution })]
      : []),
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
