import { resolve } from "node:path";
import {
  type BackendFactory,
  type BackendProtocol,
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
 *   /workspace/        -> StoreBackend (PostgresStore, per-project)
 *   /memories/         -> StoreBackend (PostgresStore, per-project)
 *   /skills/           -> FilesystemBackend (shared, read-only system skills)
 *   /workspace-skills/ -> StoreBackend (user-installed workspace skills)
 *   default            -> StateBackend (read-only, no shell)
 */
export function createProductionBackendFactory(
  canvasId: string,
  options?: {
    skillsRoot?: string;
    /** When true, add a /workspace-skills/ route backed by the Store. */
    hasWorkspaceSkills?: boolean;
  },
): { factory: BackendFactory } {
  const skillsRoot = resolve(options?.skillsRoot ?? DEFAULT_SKILLS_ROOT);
  const skillsBackend = new FilesystemBackend({ rootDir: skillsRoot, virtualMode: true });

  const factory: BackendFactory = (stateAndStore) => {
    const routes: Record<string, BackendProtocol> = {
      "/memories/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "memories"],
      }),
      "/workspace/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace"],
      }),
      "/skills/": skillsBackend,
    };

    // Add workspace-skills route when user skills are present.
    // Skill SKILL.md content is pre-written to the Store at this namespace
    // by the runtime before agent invocation.
    if (options?.hasWorkspaceSkills) {
      routes["/workspace-skills/"] = new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace-skills"],
      });
    }

    return new CompositeBackend(createReadOnlyRoot(), routes);
  };

  return { factory };
}

function createReadOnlyRoot() {
  return new StateBackend({ state: { files: {} } });
}
