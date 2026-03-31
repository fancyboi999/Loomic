import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  type BackendFactory,
  type BackendProtocol,
  CompositeBackend,
  FilesystemBackend,
  LocalShellBackend,
  StoreBackend,
} from "deepagents";

const DEFAULT_SANDBOX_ROOT = "/tmp/loomic-sandbox";
const DEFAULT_SKILLS_ROOT = "/opt/loomic/skills";

/**
 * Create a production backend with per-project LocalShellBackend sandbox.
 *
 * LocalShellBackend 作为 default backend，deepagents 自动暴露内置 `execute` 工具。
 * 每个 canvasId 对应一个独立的工作目录，用完由 runtime.ts 清理。
 *
 * 文件持久化（/workspace/、/memories/）走 StoreBackend (PostgresStore)，
 * 与 LocalShellBackend 完全独立互不影响。
 *
 * Routes:
 *   /workspace/        → StoreBackend (PostgresStore, per-project)
 *   /memories/         → StoreBackend (PostgresStore, per-project)
 *   /skills/           → FilesystemBackend (shared, read-only system skills)
 *   /workspace-skills/ → StoreBackend (user-installed workspace skills, optional)
 *   default            → LocalShellBackend (per-run sandbox, provides execute tool)
 */
export function createProductionBackendFactory(
  canvasId: string,
  options?: {
    sandboxRoot?: string;
    skillsRoot?: string;
    hasWorkspaceSkills?: boolean;
  },
): { factory: BackendFactory; sandboxDir: string } {
  const sandboxRoot = resolve(options?.sandboxRoot ?? DEFAULT_SANDBOX_ROOT);
  const skillsRoot = resolve(options?.skillsRoot ?? DEFAULT_SKILLS_ROOT);

  // Per-run isolated directory
  const runId = crypto.randomUUID();
  const sandboxDir = join(sandboxRoot, runId);
  mkdirSync(sandboxDir, { recursive: true });
  const realSandboxDir = realpathSync(sandboxDir);

  // LocalShellBackend = FilesystemBackend + execute tool
  // env 只传必要变量，不传 API key 等敏感信息
  const sandbox = new LocalShellBackend({
    rootDir: sandboxDir,
    timeout: 120,
    maxOutputBytes: 200_000,
    env: {
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      HOME: sandboxDir,
      FONT_DIR: join(skillsRoot, "canvas-design", "canvas-fonts"),
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });

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

    if (options?.hasWorkspaceSkills) {
      routes["/workspace-skills/"] = new StoreBackend(stateAndStore, {
        namespace: ["projects", canvasId, "workspace-skills"],
      });
    }

    return new CompositeBackend(sandbox, routes);
  };

  return { factory, sandboxDir: realSandboxDir };
}
