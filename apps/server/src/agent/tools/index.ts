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
