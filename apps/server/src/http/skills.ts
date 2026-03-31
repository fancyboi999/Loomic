import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  skillCreateRequestSchema,
  skillDetailResponseSchema,
  skillListResponseSchema,
  skillUpdateRequestSchema,
  unauthenticatedErrorResponseSchema,
  workspaceSkillListResponseSchema,
  workspaceSkillToggleRequestSchema,
} from "@loomic/shared";

import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type {
  RequestAuthenticator,
  UserSupabaseClient,
} from "../supabase/user.js";

type SkillErrorCode =
  | "skill_not_found"
  | "skill_create_failed"
  | "skill_update_failed"
  | "skill_delete_failed"
  | "skill_query_failed"
  | "skill_install_failed"
  | "skill_uninstall_failed"
  | "skill_toggle_failed";

export async function registerSkillRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    createUserClient: (accessToken: string) => UserSupabaseClient;
    viewerService: ViewerService;
  },
) {
  // =========================================================================
  // Skills Registry (public catalog)
  // =========================================================================

  // GET /api/skills — list all available skills
  app.get("/api/skills", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("skills")
        .select("*")
        .order("is_featured", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        request.log.error({ err: error }, "skills list query failed");
        return sendSkillError(reply, "skill_query_failed", "Unable to load skills.");
      }

      const skills = (data ?? []).map(mapSkillRow);
      return reply.code(200).send(skillListResponseSchema.parse({ skills }));
    } catch (error) {
      request.log.error({ err: error }, "skills list error");
      return sendSkillError(reply, "skill_query_failed", "Unable to load skills.");
    }
  });

  // GET /api/skills/:id — get skill detail
  app.get("/api/skills/:id", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { id } = request.params as { id: string };
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("skills")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "skill detail query failed");
        return sendSkillError(reply, "skill_query_failed", "Unable to load skill.");
      }

      if (!data) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill not found.",
          404,
        );
      }

      const skill = mapSkillDetailRow(data);
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      request.log.error({ err: error }, "skill detail error");
      return sendSkillError(reply, "skill_query_failed", "Unable to load skill.");
    }
  });

  // POST /api/skills — create custom skill
  app.post("/api/skills", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const payload = skillCreateRequestSchema.parse(request.body);
      const slug = generateSlug(payload.name);
      const client = options.createUserClient(user.accessToken);

      const { data, error } = await client
        .from("skills")
        .insert({
          name: payload.name,
          slug,
          description: payload.description,
          category: payload.category,
          skill_content: payload.skillContent,
          icon_name: payload.iconName ?? null,
          source: "user",
          created_by: user.id,
        })
        .select("*")
        .single();

      if (error) {
        request.log.error({ err: error }, "skill create failed");
        // Check for unique slug conflict
        if (error.code === "23505") {
          return sendSkillError(
            reply,
            "skill_create_failed",
            "A skill with a similar name already exists. Please choose a different name.",
            409,
          );
        }
        return sendSkillError(reply, "skill_create_failed", "Unable to create skill.");
      }

      const skill = mapSkillDetailRow(data);
      return reply.code(201).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      request.log.error({ err: error }, "skill create error");
      return sendSkillError(reply, "skill_create_failed", "Unable to create skill.");
    }
  });

  // PUT /api/skills/:id — update custom skill
  app.put("/api/skills/:id", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { id } = request.params as { id: string };
      const payload = skillUpdateRequestSchema.parse(request.body);
      const client = options.createUserClient(user.accessToken);

      // Build the update object with only provided fields
      const updates: Record<string, unknown> = {};
      if (payload.name !== undefined) {
        updates.name = payload.name;
        updates.slug = generateSlug(payload.name);
      }
      if (payload.description !== undefined) updates.description = payload.description;
      if (payload.category !== undefined) updates.category = payload.category;
      if (payload.skillContent !== undefined) updates.skill_content = payload.skillContent;
      if (payload.iconName !== undefined) updates.icon_name = payload.iconName;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "skill_update_failed",
              message: "No fields to update.",
            },
          }),
        );
      }

      const { data, error } = await client
        .from("skills")
        .update(updates)
        .eq("id", id)
        .eq("created_by", user.id) // RLS also enforces this; belt-and-suspenders
        .select("*")
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "skill update failed");
        if (error.code === "23505") {
          return sendSkillError(
            reply,
            "skill_update_failed",
            "A skill with a similar name already exists.",
            409,
          );
        }
        return sendSkillError(reply, "skill_update_failed", "Unable to update skill.");
      }

      if (!data) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill not found or you do not have permission to update it.",
          404,
        );
      }

      const skill = mapSkillDetailRow(data);
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      request.log.error({ err: error }, "skill update error");
      return sendSkillError(reply, "skill_update_failed", "Unable to update skill.");
    }
  });

  // DELETE /api/skills/:id — delete custom skill
  app.delete("/api/skills/:id", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { id } = request.params as { id: string };
      const client = options.createUserClient(user.accessToken);

      const { error, count } = await client
        .from("skills")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("created_by", user.id); // RLS also enforces this

      if (error) {
        request.log.error({ err: error }, "skill delete failed");
        return sendSkillError(reply, "skill_delete_failed", "Unable to delete skill.");
      }

      if (count === 0) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill not found or you do not have permission to delete it.",
          404,
        );
      }

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, "skill delete error");
      return sendSkillError(reply, "skill_delete_failed", "Unable to delete skill.");
    }
  });

  // =========================================================================
  // Workspace Skills (per-workspace installation)
  // =========================================================================

  // GET /api/workspaces/skills — list installed skills for current workspace
  app.get("/api/workspaces/skills", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;
      const client = options.createUserClient(user.accessToken);

      // Join workspace_skills with skills to return full skill info + install status
      const { data, error } = await client
        .from("workspace_skills")
        .select("skill_id, enabled, installed_at, skills(*)")
        .eq("workspace_id", workspaceId)
        .order("installed_at", { ascending: false });

      if (error) {
        request.log.error({ err: error }, "workspace skills list query failed");
        return sendSkillError(
          reply,
          "skill_query_failed",
          "Unable to load workspace skills.",
        );
      }

      const skills = (data ?? [])
        .filter((row) => row.skills !== null)
        .map((row) => {
          const s = row.skills as SkillRow;
          return {
            ...mapSkillRow(s),
            installed: true,
            enabled: row.enabled,
            installedAt: row.installed_at,
          };
        });

      return reply
        .code(200)
        .send(workspaceSkillListResponseSchema.parse({ skills }));
    } catch (error) {
      request.log.error({ err: error }, "workspace skills list error");
      return sendSkillError(
        reply,
        "skill_query_failed",
        "Unable to load workspace skills.",
      );
    }
  });

  // POST /api/workspaces/skills — install a skill
  app.post("/api/workspaces/skills", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const body = request.body as { skillId?: string };
      if (!body.skillId || typeof body.skillId !== "string") {
        return reply.code(400).send(
          applicationErrorResponseSchema.parse({
            error: {
              code: "skill_install_failed",
              message: "skillId is required.",
            },
          }),
        );
      }

      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;
      const client = options.createUserClient(user.accessToken);

      // Verify skill exists
      const { data: skill, error: skillError } = await client
        .from("skills")
        .select("id")
        .eq("id", body.skillId)
        .maybeSingle();

      if (skillError || !skill) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill not found.",
          404,
        );
      }

      const { error } = await client.from("workspace_skills").upsert(
        {
          workspace_id: workspaceId,
          skill_id: body.skillId,
          enabled: true,
          installed_by: user.id,
        },
        { onConflict: "workspace_id,skill_id" },
      );

      if (error) {
        request.log.error({ err: error }, "skill install failed");
        return sendSkillError(
          reply,
          "skill_install_failed",
          "Unable to install skill.",
        );
      }

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, "skill install error");
      return sendSkillError(
        reply,
        "skill_install_failed",
        "Unable to install skill.",
      );
    }
  });

  // DELETE /api/workspaces/skills/:skillId — uninstall a skill
  app.delete("/api/workspaces/skills/:skillId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { skillId } = request.params as { skillId: string };
      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;
      const client = options.createUserClient(user.accessToken);

      const { error, count } = await client
        .from("workspace_skills")
        .delete({ count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("skill_id", skillId);

      if (error) {
        request.log.error({ err: error }, "skill uninstall failed");
        return sendSkillError(
          reply,
          "skill_uninstall_failed",
          "Unable to uninstall skill.",
        );
      }

      if (count === 0) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill is not installed in this workspace.",
          404,
        );
      }

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ err: error }, "skill uninstall error");
      return sendSkillError(
        reply,
        "skill_uninstall_failed",
        "Unable to uninstall skill.",
      );
    }
  });

  // PATCH /api/workspaces/skills/:skillId — toggle enable/disable
  app.patch("/api/workspaces/skills/:skillId", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { skillId } = request.params as { skillId: string };
      const payload = workspaceSkillToggleRequestSchema.parse(request.body);
      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;
      const client = options.createUserClient(user.accessToken);

      const { data, error } = await client
        .from("workspace_skills")
        .update({ enabled: payload.enabled })
        .eq("workspace_id", workspaceId)
        .eq("skill_id", skillId)
        .select("id")
        .maybeSingle();

      if (error) {
        request.log.error({ err: error }, "skill toggle failed");
        return sendSkillError(
          reply,
          "skill_toggle_failed",
          "Unable to toggle skill.",
        );
      }

      if (!data) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill is not installed in this workspace.",
          404,
        );
      }

      return reply.code(204).send();
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }

      request.log.error({ err: error }, "skill toggle error");
      return sendSkillError(
        reply,
        "skill_toggle_failed",
        "Unable to toggle skill.",
      );
    }
  });
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Shape of a row from the `skills` table. */
type SkillRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  version: string;
  license: string | null;
  category: string;
  icon_name: string | null;
  source: string;
  skill_content: string;
  metadata: Record<string, unknown> | null;
  is_featured: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapSkillRow(row: SkillRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    author: row.author,
    version: row.version,
    category: row.category,
    iconName: row.icon_name,
    source: row.source,
    isFeatured: row.is_featured,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSkillDetailRow(row: SkillRow) {
  return {
    ...mapSkillRow(row),
    license: row.license,
    skillContent: row.skill_content,
    createdBy: row.created_by,
  };
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function sendUnauthenticated(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: {
        code: "unauthorized",
        message: "Missing or invalid bearer token.",
      },
    }),
  );
}

function sendSkillError(
  reply: FastifyReply,
  code: SkillErrorCode,
  message: string,
  statusCode = 500,
) {
  return reply.code(statusCode).send(
    applicationErrorResponseSchema.parse({
      error: { code, message },
    }),
  );
}

function isZodError(
  error: unknown,
): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
