import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ProjectFileStore } from "../persistence/file-store.js";
import { createWorkspace } from "./workspace.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "loomic-pi-workspace-"));
  roots.push(root);
  const sandboxDir = join(root, "sandbox");
  const skillsRoot = join(root, "skills");
  await mkdir(sandboxDir);
  await mkdir(skillsRoot);
  const files = new Map<string, string>([["/notes.txt", "first\nsecond"], ["/config.json", "{}"], ["/sub/config.json", "{\"ok\":true}"]]);
  const fileStore = {
    get: async (_namespace: string[], key: string) => files.get(key) ?? null,
    list: async () => [...files].map(([key, content]) => ({ key, content })),
    put: async (_namespace: string[], key: string, content: string) => { files.set(key, content); },
    create: async (_namespace: string[], key: string, content: string) => {
      if (files.has(key)) return false;
      files.set(key, content);
      return true;
    },
  } as ProjectFileStore;
  return { root, sandboxDir, skillsRoot, files, fileStore };
}

describe("Pi workspace", () => {
  it("keeps existing project files visible and supports edit, glob, and grep", async () => {
    const f = await fixture();
    const workspace = createWorkspace({ ...f, canvasId: "canvas-1" });
    expect(await workspace.lsInfo("/workspace")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/workspace/notes.txt", is_dir: false }),
      expect.objectContaining({ path: "/workspace/sub/", is_dir: true }),
    ]));
    expect(await workspace.read("/workspace/notes.txt", 1, 1)).toBe("2\tsecond");
    expect(await workspace.globInfo("**/*.json", "/workspace")).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/workspace/config.json" }),
      expect.objectContaining({ path: "/workspace/sub/config.json" }),
    ]));
    expect(await workspace.grepRaw("second", "/workspace")).toMatchObject([{ path: "/workspace/notes.txt", line: 2, text: "second" }]);
    expect(await workspace.edit("/workspace/notes.txt", "second", "updated")).toMatchObject({ occurrences: 1 });
    expect(f.files.get("/notes.txt")).toBe("first\nupdated");
  });

  it("protects read-only skills and blocks traversal and symlink writes", async () => {
    const f = await fixture();
    await writeFile(join(f.skillsRoot, "SKILL.md"), "instructions");
    const workspace = createWorkspace({ ...f, canvasId: "canvas-1" });
    expect(await workspace.read("/skills/SKILL.md")).toBe("1\tinstructions");
    expect(await workspace.write("/skills/new.md", "bad")).toMatchObject({ error: expect.any(String) });
    await expect(workspace.read("/workspace/../skills/SKILL.md")).rejects.toThrow("traversal");
    await symlink(f.root, join(f.sandboxDir, "outside"));
    await expect(workspace.write("/outside/escape.txt", "bad")).rejects.toThrow("outside");
  });

  it("executes in the run sandbox with a bounded output", async () => {
    const f = await fixture();
    const workspace = createWorkspace({ ...f });
    expect(await workspace.execute("printf hello")).toMatchObject({ output: "hello", exitCode: 0, truncated: false });
  });
});
