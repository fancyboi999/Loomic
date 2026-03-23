import type { BackendFactory, BackendProtocol } from "deepagents";

import { createProjectSearchTool } from "./project-search.js";

export function createPhaseATools(backend: BackendProtocol | BackendFactory) {
  return [createProjectSearchTool(backend)] as const;
}
