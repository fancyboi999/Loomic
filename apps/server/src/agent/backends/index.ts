import type { BackendFactory } from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import { createDevelopmentBackend } from "./dev.js";
import { createProductionBackendFactory } from "./prod.js";

type AgentBackendEnv = Pick<ServerEnv, "agentBackendMode" | "agentFilesRoot">;

export function createAgentBackendFactory(
  env: AgentBackendEnv,
  canvasId?: string,
): BackendFactory {
  if (env.agentBackendMode === "filesystem") {
    const developmentBackend = createDevelopmentBackend(env);
    return () => developmentBackend;
  }

  if (!canvasId) {
    throw new Error(
      "canvasId is required for production (state) backend mode. " +
        "Each agent run must be scoped to a project.",
    );
  }

  return createProductionBackendFactory(canvasId);
}
