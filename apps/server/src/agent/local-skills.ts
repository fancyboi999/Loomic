import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";

export type LocalSkill = Skill & { content: string };

/** Discover only the configured server skill directory, never a host user's global skills. */
export function discoverLocalSkills(skillsRoot: string, managedNames: readonly string[] = []): LocalSkill[] {
  const root = resolve(skillsRoot);
  if (!existsSync(root)) return [];
  const realRoot = realpathSync(root);
  const managed = new Set(managedNames);
  const { skills } = loadSkillsFromDir({ dir: root, source: "loomic" });

  return skills.flatMap((skill) => {
    if (managed.has(skill.name) || managed.has(basename(dirname(skill.filePath))) || skill.disableModelInvocation) return [];
    const realFile = realpathSync(skill.filePath);
    if (!realFile.startsWith(`${realRoot}${sep}`)) return [];
    const virtualPath = `/skills/${relative(root, skill.filePath).split(sep).join("/")}`;
    return [{ ...skill, filePath: virtualPath, baseDir: dirname(virtualPath), content: readFileSync(realFile, "utf8") }];
  });
}
