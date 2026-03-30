import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type BackendFactory,
  CompositeBackend,
  FilesystemBackend,
  LocalShellBackend,
  StoreBackend,
} from "deepagents";

const DEFAULT_SANDBOX_ROOT = "/tmp/loomic-sandbox";
const DEFAULT_SKILLS_ROOT = "/opt/loomic/skills";

/**
 * Create a production backend factory with per-run sandbox isolation.
 *
 * Uses LocalShellBackend as the default backend so deepagents automatically
 * exposes the `execute` tool. Each run gets an isolated tmpdir under
 * `sandboxRoot/{runId}/` which is cleaned up after the run completes.
 *
 * Routes:
 *   /workspace/ → StoreBackend (PostgresStore, per-project)
 *   /memories/  → StoreBackend (PostgresStore, per-project)
 *   /skills/    → FilesystemBackend (shared, read-only)
 *   default     → LocalShellBackend (per-run sandbox)
 */
export function createProductionBackendFactory(
  canvasId: string,
  options?: { sandboxRoot?: string; skillsRoot?: string },
): { factory: BackendFactory; sandboxDir: string } {
  const sandboxRoot = resolve(options?.sandboxRoot ?? DEFAULT_SANDBOX_ROOT);
  const skillsRoot = resolve(options?.skillsRoot ?? DEFAULT_SKILLS_ROOT);

  const runId = crypto.randomUUID();
  const sandboxDir = join(sandboxRoot, runId);
  mkdirSync(sandboxDir, { recursive: true });

  // Use realpathSync to resolve macOS /tmp → /private/tmp symlinks
  const realSandboxDir = realpathSync(sandboxDir);

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

  const factory: BackendFactory = (stateAndStore) =>
    new CompositeBackend(sandbox, {
      "/memories/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "memories"],
      }),
      "/workspace/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace"],
      }),
      "/skills/": skillsBackend,
    });

  return { factory, sandboxDir: realSandboxDir };
}
