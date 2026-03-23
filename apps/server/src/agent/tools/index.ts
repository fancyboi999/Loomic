import type { BackendProtocol } from "deepagents";

import { createProjectSearchTool } from "./project-search.js";

export function createPhaseATools(backend: BackendProtocol) {
  return [createProjectSearchTool(backend)] as const;
}
