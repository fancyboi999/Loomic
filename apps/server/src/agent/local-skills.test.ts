import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverLocalSkills } from "./local-skills.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pi skill discovery", () => {
  it("discovers new directory skills with readable virtual paths and respects workspace toggles", async () => {
    const root = await mkdtemp(join(tmpdir(), "loomic-skills-"));
    roots.push(root);
    for (const name of ["new-skill", "managed-skill"]) {
      const dir = join(root, name);
      await mkdir(dir);
      await writeFile(join(dir, "SKILL.md"), `---\nname: ${name === "managed-skill" ? "renamed-skill" : name}\ndescription: Use ${name} for design.\n---\n\n# ${name}\n`);
    }

    const skills = discoverLocalSkills(root, ["managed-skill"]);
    expect(skills.map((skill) => ({ name: skill.name, filePath: skill.filePath }))).toEqual([
      { name: "new-skill", filePath: "/skills/new-skill/SKILL.md" },
    ]);
  });
});
