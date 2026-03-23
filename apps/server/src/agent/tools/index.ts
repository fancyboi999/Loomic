import type { BackendFactory, BackendProtocol } from "deepagents";

import { createImageGenerateTool } from "./image-generate.js";
import { createProjectSearchTool } from "./project-search.js";
import { createVideoGenerateTool } from "./video-generate.js";

export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [
    createProjectSearchTool(backend),
    createImageGenerateTool(),
    createVideoGenerateTool(),
  ] as const;
}
