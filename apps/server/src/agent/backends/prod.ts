import {
  type BackendFactory,
  CompositeBackend,
  StateBackend,
  StoreBackend,
} from "deepagents";

/**
 * Create a production backend factory with per-project isolation.
 *
 * Uses StoreBackend (LangGraph PostgresStore) for persistent,
 * project-scoped file storage. Each project gets its own namespace,
 * so files written by the agent are isolated per project and persist
 * across chat sessions.
 *
 * Namespace structure:
 *   /workspace/ → ["projects", canvasId, "workspace"]
 *   /memories/  → ["projects", canvasId, "memories"]
 */
export function createProductionBackendFactory(
  canvasId: string,
): BackendFactory {
  return (stateAndStore) =>
    new CompositeBackend(createReadOnlyRoot(), {
      "/memories/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "memories"],
      }),
      "/workspace/": new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace"],
      }),
    });
}

function createReadOnlyRoot() {
  return new StateBackend({
    state: { files: {} },
  });
}
