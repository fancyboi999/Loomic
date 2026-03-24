import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAgentBackendFactory } from "../src/agent/backends/index.js";
import { loadServerEnv } from "../src/config/env.js";

const tempDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...tempDirs].map(async (directory) => {
      tempDirs.delete(directory);
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("phase-a backend factory", () => {
  it("requires an explicit filesystem root when dev filesystem mode is enabled", () => {
    const env = loadServerEnv({
      agentBackendMode: "filesystem",
    });

    expect(() => createAgentBackendFactory(env)).toThrow(
      /LOOMIC_AGENT_FILES_ROOT/,
    );
  });

  it("resolves a virtualized filesystem backend when explicitly enabled", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "loomic-backend-"));
    tempDirs.add(workspaceRoot);
    await mkdir(join(workspaceRoot, "workspace"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "workspace", "notes.md"),
      "Loomic filesystem backend sample\n",
      "utf8",
    );

    const env = loadServerEnv({
      agentBackendMode: "filesystem",
      agentFilesRoot: workspaceRoot,
    });
    const backend = createAgentBackendFactory(env)({ state: { files: {} } });

    const content = await backend.read("/workspace/notes.md");

    expect(content).toContain("Loomic filesystem backend sample");
  });

  it("requires canvasId for production (state) backend mode", () => {
    const env = loadServerEnv({
      agentBackendMode: "state",
    });

    expect(() => createAgentBackendFactory(env)).toThrow(
      /canvasId is required/,
    );
  });

  it("creates a project-isolated backend when canvasId is provided", () => {
    const env = loadServerEnv({
      agentBackendMode: "state",
    });

    const factory = createAgentBackendFactory(env, "test-canvas-123");

    expect(typeof factory).toBe("function");
  });
});
