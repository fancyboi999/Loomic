import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersistSandboxFileTool } from "./persist-sandbox-file.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("persist_sandbox_file path boundary", () => {
  it("rejects sibling paths with the same prefix and symlinks outside the sandbox", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-upload-boundary-"));
    roots.push(root);
    const sandboxDir = join(root, "sandbox");
    const siblingDir = join(root, "sandbox-other");
    await mkdir(sandboxDir);
    await mkdir(siblingDir);
    const outside = join(siblingDir, "secret.png");
    await writeFile(outside, "secret");
    const link = join(sandboxDir, "link.png");
    await symlink(outside, link);
    const createUserClient = vi.fn();
    const tool = createPersistSandboxFileTool({ createUserClient, sandboxDir }, { access_token: "test" });

    for (const filePath of [outside, link]) {
      const result = await tool.execute("call-1", { filePath }, new AbortController().signal);
      expect(result.content).toEqual([{ type: "text", text: "Error: filePath must be inside the sandbox directory." }]);
    }
    expect(createUserClient).not.toHaveBeenCalled();
  });
});
