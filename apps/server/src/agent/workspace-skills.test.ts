import { describe, expect, it } from "vitest";

import type { UserSupabaseClient } from "../supabase/user.js";
import { loadWorkspaceSkills } from "./workspace-skills.js";

describe("workspace Skill catalog", () => {
  it("keeps enabled Skill content and files while hiding a disabled Skill", async () => {
    const client = {
      from(table: string) {
        if (table === "canvases") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { project: { workspace_id: "workspace-1" } } }) }) }),
        };
        if (table === "workspace_skills") return {
          select: () => ({ eq: async () => ({ data: [
            { enabled: true, skill: { id: "skill-1", slug: "active", description: "Active", skill_content: "Use this." } },
            { enabled: false, skill: { id: "skill-2", slug: "disabled", description: "Disabled", skill_content: "Do not use." } },
          ], error: null }) }),
        };
        if (table === "skills") return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
        };
        if (table === "skill_files") return {
          select: () => ({ in: async () => ({ data: [{ skill_id: "skill-1", file_path: "references/guide.md", content: "Guide" }] }) }),
        };
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as UserSupabaseClient;

    expect(await loadWorkspaceSkills(client, "canvas-1")).toEqual({
      managedNames: ["active", "disabled"],
      enabled: [{
        name: "active", description: "Active", path: "/workspace-skills/active/SKILL.md",
        content: "Use this.", files: [{ path: "references/guide.md", content: "Guide" }],
      }],
    });
  });

  it("keeps uninstalled system Skills managed by the workspace toggle", async () => {
    const client = {
      from(table: string) {
        if (table === "canvases") return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { project: { workspace_id: "workspace-1" } } }) }) }),
        };
        if (table === "workspace_skills") return {
          select: () => ({ eq: async () => ({ data: [], error: null }) }),
        };
        if (table === "skills") return {
          select: () => ({ eq: async () => ({ data: [{ slug: "json-image-prompt" }], error: null }) }),
        };
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as UserSupabaseClient;

    expect(await loadWorkspaceSkills(client, "canvas-1")).toEqual({
      enabled: [],
      managedNames: ["json-image-prompt"],
    });
  });
});
