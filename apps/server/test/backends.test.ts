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

  it("keeps /workspace and /memories on state-backed storage in production mode", async () => {
    const env = loadServerEnv({
      agentBackendMode: "state",
    });
    const backend = createAgentBackendFactory(env)({
      state: {
        files: {
          "/workspace/seed.md": createFileData("workspace seed"),
          "/memories/profile.md": createFileData("memory seed"),
        },
      },
    });

    const rootListing = await backend.lsInfo("/");
    const workspaceWrite = await backend.write(
      "/workspace/plan.md",
      "new plan",
    );
    const memoriesWrite = await backend.write(
      "/memories/profile-next.md",
      "new memory",
    );

    expect(rootListing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ is_dir: true, path: "/workspace/" }),
        expect.objectContaining({ is_dir: true, path: "/memories/" }),
      ]),
    );
    expect(workspaceWrite.filesUpdate).toBeDefined();
    expect(memoriesWrite.filesUpdate).toBeDefined();
  });
});

function createFileData(content: string) {
  const timestamp = "2026-03-23T12:00:00.000Z";

  return {
    content: content.split("\n"),
    created_at: timestamp,
    modified_at: timestamp,
  };
}
