import type { UserSupabaseClient } from "../supabase/user.js";

/**
 * Metadata for a workspace skill loaded from the database.
 * Compatible with the deepagents SkillsMiddleware SkillMetadata shape.
 */
export interface WorkspaceSkillEntry {
  /** Skill slug (used as directory name in virtual path) */
  name: string;
  /** Human-readable description for the system prompt */
  description: string;
  /** Virtual path where the agent can read_file the full SKILL.md content */
  path: string;
  /** Raw SKILL.md content stored in the database */
  content: string;
}

/**
 * Load enabled skills (both system and user-created) for a given canvas.
 *
 * Resolves the canvas → project → workspace chain, then fetches all
 * skills installed and enabled in that workspace. Only skills with
 * non-empty `skill_content` are returned.
 */
export async function loadWorkspaceSkills(
  userClient: UserSupabaseClient,
  canvasId: string,
): Promise<WorkspaceSkillEntry[]> {
  // Step 1: Resolve canvas → project → workspace
  const workspaceId = await resolveWorkspaceId(userClient, canvasId);
  if (!workspaceId) return [];

  // Step 2: Query enabled workspace skills with full skill data
  // NOTE: workspace_skills / skills tables may not yet be in the generated
  // Supabase types — use `as any` to bypass PostgREST type checking.
  const { data: rows, error } = await (userClient as any)
    .from("workspace_skills")
    .select(
      "skill:skills(id, slug, name, description, skill_content, metadata)",
    )
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);

  if (error || !rows?.length) return [];

  // Step 3: Map to WorkspaceSkillEntry, filtering out skills without DB content
  return (rows as Array<{ skill: Record<string, unknown> | null }>)
    .map((row: { skill: Record<string, unknown> | null }) => {
      const skill = row.skill;
      if (!skill?.skill_content) {
        if (skill?.slug) {
          console.warn(
            `[workspace-skills] Skill "${skill.slug}" is enabled but has empty content — skipping`,
          );
        }
        return null;
      }
      const slug = skill.slug as string;
      return {
        name: slug,
        description: skill.description as string,
        path: `/workspace-skills/${slug}/SKILL.md`,
        content: skill.skill_content as string,
      };
    })
    .filter((entry): entry is WorkspaceSkillEntry => entry !== null);
}

/**
 * Resolve canvas ID → workspace ID via the canvas → project join.
 */
async function resolveWorkspaceId(
  client: UserSupabaseClient,
  canvasId: string,
): Promise<string | null> {
  // Try joined query first (single round-trip)
  try {
    const { data } = await client
      .from("canvases")
      .select("project:projects(workspace_id)")
      .eq("id", canvasId)
      .maybeSingle();

    const project = data?.project as { workspace_id?: string } | null;
    if (project?.workspace_id) return project.workspace_id;
  } catch {
    // FK may not be exposed via PostgREST — fall back to two-step
  }

  // Two-step fallback
  try {
    const { data: canvas } = await client
      .from("canvases")
      .select("project_id")
      .eq("id", canvasId)
      .maybeSingle();

    if (!canvas?.project_id) return null;

    const { data: project } = await client
      .from("projects")
      .select("workspace_id")
      .eq("id", canvas.project_id)
      .maybeSingle();

    return (project?.workspace_id as string) ?? null;
  } catch {
    return null;
  }
}
