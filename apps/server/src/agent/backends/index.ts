import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ServerEnv } from "../../config/env.js";
import type { ProjectFileStore } from "../persistence/file-store.js";
import type { AgentWorkspace } from "./types.js";
import { createWorkspace } from "./workspace.js";

type AgentBackendEnv = Pick<ServerEnv, "agentBackendMode" | "agentFilesRoot" | "skillsRoot">;

export type AgentBackendResult = { workspace: AgentWorkspace; sandboxDir: string; skillsRoot: string };

export function createAgentBackend(
  env: AgentBackendEnv,
  canvasId?: string,
  options?: { hasWorkspaceSkills?: boolean; fileStore?: ProjectFileStore; sandboxRoot?: string },
): AgentBackendResult {
  const filesystem = env.agentBackendMode === "filesystem";
  if (filesystem && !env.agentFilesRoot) {
    throw new Error("LOOMIC_AGENT_FILES_ROOT must be set in filesystem backend mode.");
  }
  if (!filesystem && !canvasId) {
    throw new Error("canvasId is required for production agent runs.");
  }
  if (!filesystem && !options?.fileStore) {
    throw new Error("Project file persistence is required for production agent runs.");
  }

  const sandboxRoot = resolve(options?.sandboxRoot ?? (filesystem ? "/tmp/loomic-sandbox-dev" : "/tmp/loomic-sandbox"));
  const sandboxDir = join(sandboxRoot, crypto.randomUUID());
  mkdirSync(sandboxDir, { recursive: true });
  const realSandboxDir = realpathSync(sandboxDir);
  const skillsRoot = resolve(env.skillsRoot ?? (filesystem ? join(env.agentFilesRoot!, "skills") : "/opt/loomic/skills"));
  if (filesystem) mkdirSync(env.agentFilesRoot!, { recursive: true });

  return {
    sandboxDir: realSandboxDir,
    skillsRoot,
    workspace: createWorkspace({
      sandboxDir: realSandboxDir,
      skillsRoot,
      ...(filesystem ? { workspaceRoot: env.agentFilesRoot! } : {}),
      ...(canvasId ? { canvasId } : {}),
      ...(options?.fileStore ? { fileStore: options.fileStore } : {}),
      ...(options?.hasWorkspaceSkills ? { hasWorkspaceSkills: true } : {}),
    }),
  };
}
