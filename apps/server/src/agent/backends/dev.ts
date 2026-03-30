import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CompositeBackend,
  FilesystemBackend,
  LocalShellBackend,
} from "deepagents";

import type { ServerEnv } from "../../config/env.js";
import type { AgentBackendResult } from "./index.js";

type AgentBackendEnv = Pick<ServerEnv, "agentFilesRoot" | "skillsRoot">;

const DEFAULT_DEV_SANDBOX_ROOT = "/tmp/loomic-sandbox-dev";

/**
 * Create a development backend with local sandbox execution.
 *
 * Uses LocalShellBackend for code execution. The agent's workspace files
 * are stored locally at agentFilesRoot, and skills are loaded from skillsRoot.
 */
export function createDevelopmentBackend(
  env: AgentBackendEnv,
): AgentBackendResult {
  if (!env.agentFilesRoot) {
    throw new Error(
      "LOOMIC_AGENT_FILES_ROOT must be set when filesystem backend mode is enabled.",
    );
  }

  const runId = crypto.randomUUID();
  const sandboxDir = join(resolve(DEFAULT_DEV_SANDBOX_ROOT), runId);
  mkdirSync(sandboxDir, { recursive: true });
  const realSandboxDir = realpathSync(sandboxDir);

  const skillsRoot = resolve(env.skillsRoot ?? join(env.agentFilesRoot, "skills"));

  const sandbox = new LocalShellBackend({
    rootDir: sandboxDir,
    timeout: 120,
    maxOutputBytes: 200_000,
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: process.env.HOME ?? "/tmp",
      FONT_DIR: join(skillsRoot, "canvas-design", "canvas-fonts"),
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  const skillsBackend = new FilesystemBackend({ rootDir: skillsRoot, virtualMode: true });

  const workspaceBackend = new FilesystemBackend({
    rootDir: env.agentFilesRoot,
    virtualMode: true,
  });

  const factory = () =>
    new CompositeBackend(sandbox, {
      "/workspace/": workspaceBackend,
      "/skills/": skillsBackend,
    });

  return { factory, sandboxDir: realSandboxDir };
}
