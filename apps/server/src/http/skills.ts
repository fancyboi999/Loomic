import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  skillCreateRequestSchema,
  skillDetailResponseSchema,
  skillImportRequestSchema,
  skillListResponseSchema,
  skillUpdateRequestSchema,
  unauthenticatedErrorResponseSchema,
  workspaceSkillListResponseSchema,
  workspaceSkillToggleRequestSchema,
} from "@loomic/shared";

import { importSkillFromUrl, SkillImportError } from "../features/skills/skill-import-service.js";

import type { ViewerService } from "../features/bootstrap/ensure-user-foundation.js";
import type {
  RequestAuthenticator,
  UserSupabaseClient,
} from "../supabase/user.js";

/**
 * Helper to bypass Supabase generated types for tables not yet in the schema
 * (skills, workspace_skills). Returns untyped client so PostgREST queries compile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedFrom = (client: UserSupabaseClient, table: string) => (client as any).from(table);

type SkillErrorCode =
  | "skill_not_found"
  | "skill_create_failed"
  | "skill_update_failed"
  | "skill_delete_failed"
  | "skill_query_failed"
  | "skill_file_query_failed"
  | "skill_import_failed"
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
      const { data, error } = await untypedFrom(client, "skills")
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
      const { data, error } = await untypedFrom(client, "skills")
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

      // Fetch associated files
      const { data: fileData } = await untypedFrom(client, "skill_files")
        .select("*")
        .eq("skill_id", id)
        .order("file_path", { ascending: true });

      const skill = {
        ...mapSkillDetailRow(data),
        files: (fileData ?? []).map(mapSkillFileRow),
      };
      return reply.code(200).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      request.log.error({ err: error }, "skill detail error");
      return sendSkillError(reply, "skill_query_failed", "Unable to load skill.");
    }
  });

  // GET /api/skills/:id/files — list all files for a skill
  app.get("/api/skills/:id/files", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { id } = request.params as { id: string };
      const client = options.createUserClient(user.accessToken);

      const { data, error } = await untypedFrom(client, "skill_files")
        .select("*")
        .eq("skill_id", id)
        .order("file_path", { ascending: true });

      if (error) {
        request.log.error({ err: error }, "skill files list failed");
        return sendSkillError(reply, "skill_file_query_failed", "Unable to load skill files.");
      }

      return reply.code(200).send({ files: (data ?? []).map(mapSkillFileRow) });
    } catch (error) {
      request.log.error({ err: error }, "skill files list error");
      return sendSkillError(reply, "skill_file_query_failed", "Unable to load skill files.");
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

      const { data, error } = await untypedFrom(client, "skills")
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

      // Insert associated files if provided
      if (payload.files?.length && data?.id) {
        const fileRows = payload.files.map((f) => ({
          skill_id: data.id,
          file_path: f.filePath,
          content: f.content,
          mime_type: f.mimeType ?? "text/plain",
        }));
        const { error: fileError } = await untypedFrom(client, "skill_files").insert(fileRows);
        if (fileError) {
          // Non-fatal: skill was created but files failed — log and continue
          request.log.error({ err: fileError }, "skill file insert failed (non-fatal)");
        }
      }

      // Fetch files back so the response includes them
      const { data: fileData } = await untypedFrom(client, "skill_files")
        .select("*")
        .eq("skill_id", data.id)
        .order("file_path", { ascending: true });

      const skill = {
        ...mapSkillDetailRow(data),
        files: (fileData ?? []).map(mapSkillFileRow),
      };
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

  // POST /api/skills/import — import skill from external URL (GitHub, npm tarball)
  app.post("/api/skills/import", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthenticated(reply);

      const { url } = skillImportRequestSchema.parse(request.body);
      const viewer = await options.viewerService.ensureViewer(user);
      const workspaceId = viewer.workspace.id;
      const client = options.createUserClient(user.accessToken);

      // Import skill from external URL (downloads SKILL.md + associated files)
      const imported = await importSkillFromUrl(url);

      const slug = generateSlug(imported.manifest.name);

      // Persist skill to DB (source = "community" for externally imported skills)
      const { data: skillData, error: skillError } = await untypedFrom(client, "skills")
        .insert({
          name: imported.manifest.name,
          slug,
          description: imported.manifest.description,
          author: imported.manifest.author ?? "unknown",
          version: imported.manifest.version ?? "1.0",
          license: imported.manifest.license ?? null,
          category: "custom",
          source: "community",
          skill_content: imported.skillContent,
          source_url: imported.sourceUrl,
          metadata: imported.manifest.metadata ?? {},
          created_by: user.id,
        })
        .select("*")
        .single();

      if (skillError) {
        request.log.error({ err: skillError }, "skill import DB insert failed");
        if (skillError.code === "23505") {
          return sendSkillError(reply, "skill_import_failed", "A skill with this name already exists.", 409);
        }
        return sendSkillError(reply, "skill_import_failed", "Failed to save imported skill.");
      }

      // Insert associated files (scripts/, references/, assets/)
      if (imported.files.length > 0 && skillData?.id) {
        const fileRows = imported.files.map((f: { filePath: string; content: string; mimeType: string }) => ({
          skill_id: skillData.id,
          file_path: f.filePath,
          content: f.content,
          mime_type: f.mimeType,
        }));
        const { error: fileError } = await untypedFrom(client, "skill_files").insert(fileRows);
        if (fileError) {
          // Non-fatal: skill record was created but file inserts failed
          request.log.error({ err: fileError }, "skill import file insert failed (non-fatal)");
        }
      }

      // Auto-install imported skill to the user's current workspace
      if (skillData?.id) {
        await untypedFrom(client, "workspace_skills").upsert(
          { workspace_id: workspaceId, skill_id: skillData.id, enabled: true, installed_by: user.id },
          { onConflict: "workspace_id,skill_id" },
        );
      }

      // Fetch files back so the response includes them
      const { data: fileData } = await untypedFrom(client, "skill_files")
        .select("*")
        .eq("skill_id", skillData.id)
        .order("file_path", { ascending: true });

      const skill = {
        ...mapSkillDetailRow(skillData),
        files: (fileData ?? []).map(mapSkillFileRow),
      };

      request.log.info({ skillId: skillData.id, sourceUrl: url }, "skill imported successfully");
      return reply.code(201).send(skillDetailResponseSchema.parse({ skill }));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({ issues: (error as { issues: unknown[] }).issues, message: "Invalid request body" });
      }
      if (error instanceof SkillImportError) {
        request.log.warn({ code: error.code, message: error.message }, "skill import rejected");
        return sendSkillError(reply, "skill_import_failed", error.message, 400);
      }
      request.log.error({ err: error }, "skill import error");
      return sendSkillError(reply, "skill_import_failed", "Failed to import skill.");
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

      const { data, error } = await untypedFrom(client, "skills")
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

      const { error, count } = await untypedFrom(client, "skills")
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
      const { data, error } = await untypedFrom(client, "workspace_skills")
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

      const skills = ((data ?? []) as any[])
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
      const { data: skill, error: skillError } = await untypedFrom(client, "skills")
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

      const { error } = await untypedFrom(client, "workspace_skills").upsert(
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

      const { error, count } = await untypedFrom(client, "workspace_skills")
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

      // Verify skill exists in the catalog
      const { data: skill, error: skillError } = await untypedFrom(client, "skills")
        .select("id")
        .eq("id", skillId)
        .maybeSingle();

      if (skillError || !skill) {
        return sendSkillError(
          reply,
          "skill_not_found",
          "Skill not found.",
          404,
        );
      }

      // Upsert: create workspace_skills row if not installed, or update enabled state
      const { error } = await untypedFrom(client, "workspace_skills").upsert(
        {
          workspace_id: workspaceId,
          skill_id: skillId,
          enabled: payload.enabled,
          installed_by: user.id,
        },
        { onConflict: "workspace_id,skill_id" },
      );

      if (error) {
        request.log.error({ err: error }, "skill toggle failed");
        return sendSkillError(
          reply,
          "skill_toggle_failed",
          "Unable to toggle skill.",
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
  // Added by 20260403100000_skill_files migration
  source_url?: string | null;
  package_name?: string | null;
};

/** Shape of a row from the `skill_files` table. */
type SkillFileRow = {
  id: string;
  skill_id: string;
  file_path: string;
  content: string;
  mime_type: string;
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

function mapSkillFileRow(row: SkillFileRow) {
  return {
    id: row.id,
    filePath: row.file_path,
    content: row.content,
    mimeType: row.mime_type,
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
    sourceUrl: row.source_url ?? null,
    packageName: row.package_name ?? null,
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
