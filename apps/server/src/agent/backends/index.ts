import type { BackendFactory } from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import { createDevelopmentBackend } from "./dev.js";
import { createProductionBackendFactory } from "./prod.js";

type AgentBackendEnv = Pick<
  ServerEnv,
  "agentBackendMode" | "agentFilesRoot" | "skillsRoot"
>;

export type AgentBackendResult = {
  factory: BackendFactory;
  sandboxDir?: string;
};

export function createAgentBackend(
  env: AgentBackendEnv,
  canvasId?: string,
  options?: { hasWorkspaceSkills?: boolean },
): AgentBackendResult {
  if (env.agentBackendMode === "filesystem") {
    return createDevelopmentBackend(env, {
      canvasId,
      hasWorkspaceSkills: options?.hasWorkspaceSkills,
    });
  }

  if (!canvasId) {
    throw new Error(
      "canvasId is required for production (state) backend mode. " +
        "Each agent run must be scoped to a project.",
    );
  }

  return createProductionBackendFactory(canvasId, {
    ...(env.skillsRoot ? { skillsRoot: env.skillsRoot } : {}),
    ...(options?.hasWorkspaceSkills ? { hasWorkspaceSkills: true } : {}),
  });
}
