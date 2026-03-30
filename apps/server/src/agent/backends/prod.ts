import { resolve } from "node:path";
import {
  type BackendFactory,
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  StoreBackend,
} from "deepagents";

const DEFAULT_SKILLS_ROOT = "/opt/loomic/skills";

/**
 * Create a production backend factory using StateBackend (read-only, no execute).
 *
 * Code execution is handled by the PGMQ-based execute tool, which submits
 * commands to the worker process. The API server never runs code locally.
 *
 * Routes:
 *   /workspace/ -> StoreBackend (PostgresStore, per-project)
 *   /memories/  -> StoreBackend (PostgresStore, per-project)
 *   /skills/    -> FilesystemBackend (shared, read-only)
 *   default     -> StateBackend (read-only, no shell)
 */
export function createProductionBackendFactory(
  canvasId: string,
  options?: { skillsRoot?: string },
): { factory: BackendFactory } {
  const skillsRoot = resolve(options?.skillsRoot ?? DEFAULT_SKILLS_ROOT);
  const skillsBackend = new FilesystemBackend({ rootDir: skillsRoot, virtualMode: true });

  const factory: BackendFactory = (stateAndStore) =>
    new CompositeBackend(createReadOnlyRoot(), {
      "/memories/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "memories"],
      }),
      "/workspace/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace"],
      }),
      "/skills/": skillsBackend,
    });

  return { factory };
}

function createReadOnlyRoot() {
  return new StateBackend({ state: { files: {} } });
}
