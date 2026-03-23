import { type BackendProtocol, FilesystemBackend } from "deepagents";

import type { ServerEnv } from "../../config/env.js";

type AgentBackendEnv = Pick<ServerEnv, "agentFilesRoot">;

export function createDevelopmentBackend(
  env: AgentBackendEnv,
): BackendProtocol {
  if (!env.agentFilesRoot) {
    throw new Error(
      "LOOMIC_AGENT_FILES_ROOT must be set when filesystem backend mode is enabled.",
    );
  }

  return new FilesystemBackend({
    rootDir: env.agentFilesRoot,
    virtualMode: true,
  });
}
