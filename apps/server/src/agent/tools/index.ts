import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentWorkspace } from "../backends/types.js";
import type { ConnectionManager } from "../../ws/connection-manager.js";
import { createBrandKitTool } from "./brand-kit.js";
import { createInspectCanvasTool } from "./inspect-canvas.js";
import { createManipulateCanvasTool } from "./manipulate-canvas.js";
import { createImageGenerateTool, type PersistImageFn, type SubmitImageJobFn } from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createScreenshotCanvasTool } from "./screenshot-canvas.js";
import { createVideoGenerateTool, type SubmitVideoJobFn, type TranslateVideoPromptFn } from "./video-generate.js";
import { createPersistSandboxFileTool } from "./persist-sandbox-file.js";
import type { ToolContext } from "./pi-tool.js";

export { createImageGenerateTool } from "./image-generate.js";
export { createVideoGenerateTool } from "./video-generate.js";
export { createInspectCanvasTool } from "./inspect-canvas.js";
export { createManipulateCanvasTool } from "./manipulate-canvas.js";

export function createMainAgentTools(
  backend: AgentWorkspace,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
    connectionManager?: ConnectionManager;
    persistImage?: PersistImageFn;
    sandboxDir?: string;
    submitImageJob?: SubmitImageJobFn;
    imageModelIds?: string[];
    videoModelIds?: string[];
    submitVideoJob?: SubmitVideoJobFn;
    translateVideoPrompt?: TranslateVideoPromptFn;
  },
  context: ToolContext = {},
): AgentTool[] {
  const tools: AgentTool[] = [
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps, context),
    createManipulateCanvasTool(deps, context),
    createImageGenerateTool({
      ...(deps.persistImage ? { persistImage: deps.persistImage } : {}),
      ...(deps.submitImageJob ? { submitImageJob: deps.submitImageJob } : {}),
      ...(deps.imageModelIds ? { allowedModelIds: deps.imageModelIds } : {}),
    }, context),
    createVideoGenerateTool({
      ...(deps.submitVideoJob ? { submitVideoJob: deps.submitVideoJob } : {}),
      ...(deps.videoModelIds ? { allowedModelIds: deps.videoModelIds } : {}),
      ...(deps.translateVideoPrompt ? { translatePrompt: deps.translateVideoPrompt } : {}),
    }, context),
    createPersistSandboxFileTool({
      createUserClient: deps.createUserClient,
      ...(deps.sandboxDir ? { sandboxDir: deps.sandboxDir } : {}),
    }, context),
  ];
  if (deps.brandKitId) tools.push(createBrandKitTool(deps, deps.brandKitId, context));
  if (deps.connectionManager) {
    tools.push(createScreenshotCanvasTool({
      connectionManager: deps.connectionManager,
      ...(deps.persistImage ? { persistImage: deps.persistImage } : {}),
    }, context));
  }
  return tools;
}
