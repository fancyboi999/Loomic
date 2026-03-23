import type { BackendFactory } from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import { createDevelopmentBackend } from "./dev.js";
import { createProductionBackendFactory } from "./prod.js";

type AgentBackendEnv = Pick<ServerEnv, "agentBackendMode" | "agentFilesRoot">;

export function createAgentBackendFactory(
  env: AgentBackendEnv,
): BackendFactory {
  if (env.agentBackendMode === "filesystem") {
    const developmentBackend = createDevelopmentBackend(env);
    return () => developmentBackend;
  }

  return createProductionBackendFactory();
}
