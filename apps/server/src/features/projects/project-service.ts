import type {
  ProjectCreateRequest,
  ProjectSummary,
  ProjectUpdateRequest,
} from "@loomic/shared";

import {
  BootstrapError,
  type ViewerService,
} from "../bootstrap/ensure-user-foundation.js";
import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

const THUMBNAIL_BUCKET = "project-assets";
const THUMBNAIL_URL_EXPIRY_SECONDS = 3600;
const PROJECT_QUERY_FAILED_MESSAGE = "Unable to load projects.";
const PROJECT_CREATE_FAILED_MESSAGE = "Unable to create project.";
const PROJECT_DELETE_FAILED_MESSAGE = "Unable to delete project.";
const PROJECT_NOT_FOUND_MESSAGE = "Project not found.";
const PROJECT_UPDATE_FAILED_MESSAGE = "Unable to update project.";
const PROJECT_SLUG_TAKEN_MESSAGE =
  "Project slug is already taken in this workspace.";

export type ProjectService = {
  archiveProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void>;
  createProject(
    user: AuthenticatedUser,
    input: ProjectCreateRequest,
  ): Promise<ProjectSummary>;
  getProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    workspace_id: string;
    brand_kit_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  listProjects(user: AuthenticatedUser): Promise<ProjectSummary[]>;
  saveThumbnail(
    user: AuthenticatedUser,
    projectId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ thumbnailUrl: string }>;
  updateProject(
    user: AuthenticatedUser,
    projectId: string,
    input: ProjectUpdateRequest,
  ): Promise<void>;
};

export class ProjectServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "project_create_failed"
    | "project_delete_failed"
    | "project_not_found"
    | "project_query_failed"
    | "project_slug_taken"
    | "project_update_failed";

  constructor(
    code:
      | "project_create_failed"
      | "project_delete_failed"
      | "project_not_found"
      | "project_query_failed"
      | "project_slug_taken"
      | "project_update_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createProjectService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
  viewerService: ViewerService;
}): ProjectService {
  return {
    async archiveProject(user, projectId) {
      const client = options.createUserClient(user.accessToken);

      const { data: existing, error: findError } = await client
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .is("archived_at", null)
        .maybeSingle();

      if (findError) {
        throw new ProjectServiceError(
          "project_delete_failed",
          PROJECT_DELETE_FAILED_MESSAGE,
          500,
        );
      }

      if (!existing) {
        throw new ProjectServiceError(
          "project_not_found",
          PROJECT_NOT_FOUND_MESSAGE,
          404,
        );
      }

      const { error: updateError } = await client
        .from("projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", projectId);

      if (updateError) {
        throw new ProjectServiceError(
          "project_delete_failed",
          PROJECT_DELETE_FAILED_MESSAGE,
          500,
        );
      }
    },
    async getProject(user, projectId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("projects")
        .select("id, name, slug, description, workspace_id, brand_kit_id, created_at, updated_at")
        .eq("id", projectId)
        .is("archived_at", null)
        .maybeSingle();

      if (error) throw new ProjectServiceError("project_query_failed", "Failed to load project.", 500);
      if (!data) throw new ProjectServiceError("project_not_found", "Project not found.", 404);
      return data;
    },
    async createProject(user, input) {
      await ensureFoundation(options.viewerService, user, "project_create_failed");

      const client = options.createUserClient(user.accessToken);
      const workspace = await resolvePersonalWorkspace(
        client,
        user.id,
        "project_create_failed",
      );
      const normalizedName = input.name.trim();
      const slug = slugify(normalizedName);

      const { data, error } = await client.rpc(
        "create_project_with_canvas",
        {
          p_workspace_id: workspace.id,
          p_name: normalizedName,
          p_slug: slug,
          p_description: normalizeDescription(input.description),
          p_canvas_name: "Main Canvas",
        },
      );

      if (error) {
        throw mapProjectCreateError(error);
      }

      const result = data as {
        project: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
          workspace_id: string;
        };
        canvas: {
          id: string;
          name: string;
          is_primary: boolean;
        };
      } | null;

      if (!result?.project?.id || !result?.canvas?.id) {
        throw new ProjectServiceError(
          "project_create_failed",
          PROJECT_CREATE_FAILED_MESSAGE,
          500,
        );
      }

      return mapProjectSummary({
        canvas: result.canvas,
        project: result.project,
        workspace,
      });
    },
    async listProjects(user) {
      // Skip bootstrap for read-only queries — user is already authenticated,
      // and /api/viewer handles bootstrap on page load.
      const client = options.createUserClient(user.accessToken);
      const workspace = await resolvePersonalWorkspace(
        client,
        user.id,
        "project_query_failed",
      );
      const { data: projects, error: projectQueryError } = await client
        .from("projects")
        .select(
          "id, name, slug, description, created_at, updated_at, workspace_id, thumbnail_path",
        )
        .eq("workspace_id", workspace.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (projectQueryError) {
        throw new ProjectServiceError(
          "project_query_failed",
          PROJECT_QUERY_FAILED_MESSAGE,
          500,
        );
      }

      if (!projects.length) {
        return [];
      }

      const { data: canvases, error: canvasQueryError } = await client
        .from("canvases")
        .select("id, name, is_primary, project_id")
        .in(
          "project_id",
          projects.map((project) => project.id),
        )
        .eq("is_primary", true);

      if (canvasQueryError) {
        throw new ProjectServiceError(
          "project_query_failed",
          PROJECT_QUERY_FAILED_MESSAGE,
          500,
        );
      }

      const primaryCanvasByProjectId = new Map(
        canvases.map((canvas) => [canvas.project_id, canvas]),
      );

      // Generate signed thumbnail URLs for projects that have them
      const thumbnailUrls = await generateThumbnailUrls(
        client,
        projects.filter((p) => p.thumbnail_path),
      );

      return projects.map((project) => {
        const canvas = primaryCanvasByProjectId.get(project.id);

        if (!canvas) {
          throw new ProjectServiceError(
            "project_query_failed",
            PROJECT_QUERY_FAILED_MESSAGE,
            500,
          );
        }

        return mapProjectSummary({
          canvas,
          project,
          thumbnailUrl: thumbnailUrls.get(project.id) ?? null,
          workspace,
        });
      });
    },

    async saveThumbnail(user, projectId, buffer, mimeType) {
      const client = options.createUserClient(user.accessToken);

      // Resolve workspace_id — RLS requires first path segment to be the workspace UUID
      const { data: proj } = await client
        .from("projects")
        .select("workspace_id")
        .eq("id", projectId)
        .single();
      if (!proj) {
        throw new ProjectServiceError("project_create_failed", "Project not found.", 404);
      }

      const ext = mimeType === "image/webp" ? "webp" : "png";
      const objectPath = `${proj.workspace_id}/${projectId}/thumbnail.${ext}`;

      const { error: uploadError } = await client.storage
        .from(THUMBNAIL_BUCKET)
        .upload(objectPath, buffer, { contentType: mimeType, upsert: true });

      if (uploadError) {
        throw new ProjectServiceError(
          "project_create_failed",
          `Thumbnail upload failed: ${uploadError.message}`,
          500,
        );
      }

      const { error: updateError } = await client
        .from("projects")
        .update({ thumbnail_path: objectPath })
        .eq("id", projectId);

      if (updateError) {
        throw new ProjectServiceError(
          "project_create_failed",
          "Failed to save thumbnail reference.",
          500,
        );
      }

      const { data: urlData } = await client.storage
        .from(THUMBNAIL_BUCKET)
        .createSignedUrl(objectPath, THUMBNAIL_URL_EXPIRY_SECONDS);

      return { thumbnailUrl: urlData?.signedUrl ?? "" };
    },

    async updateProject(user, projectId, input) {
      const client = options.createUserClient(user.accessToken);

      const payload: Record<string, unknown> = {};
      if (input.brand_kit_id !== undefined) payload.brand_kit_id = input.brand_kit_id;
      if (input.name !== undefined) payload.name = input.name;

      if (Object.keys(payload).length === 0) {
        return;
      }

      const { error: updateError, count } = await client
        .from("projects")
        .update(payload)
        .eq("id", projectId);

      if (updateError) {
        throw new ProjectServiceError(
          "project_update_failed",
          PROJECT_UPDATE_FAILED_MESSAGE,
          500,
        );
      }

      if (count === 0) {
        throw new ProjectServiceError(
          "project_not_found",
          PROJECT_NOT_FOUND_MESSAGE,
          404,
        );
      }
    },
  };
}

async function ensureFoundation(
  viewerService: ViewerService,
  user: AuthenticatedUser,
  errorCode: "project_create_failed" | "project_query_failed",
) {
  try {
    await viewerService.ensureViewer(user);
  } catch (error) {
    if (error instanceof BootstrapError) {
      throw new ProjectServiceError(
        errorCode,
        errorCode === "project_create_failed"
          ? PROJECT_CREATE_FAILED_MESSAGE
          : PROJECT_QUERY_FAILED_MESSAGE,
        500,
      );
    }
    throw error;
  }
}

async function resolvePersonalWorkspace(
  client: UserSupabaseClient,
  userId: string,
  errorCode: "project_create_failed" | "project_query_failed",
) {
  const { data, error } = await client
    .from("workspaces")
    .select("id, name, type, owner_user_id")
    .eq("owner_user_id", userId)
    .eq("type", "personal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new ProjectServiceError(
      errorCode,
      errorCode === "project_create_failed"
        ? PROJECT_CREATE_FAILED_MESSAGE
        : PROJECT_QUERY_FAILED_MESSAGE,
      500,
    );
  }

  return {
    id: data.id,
    name: data.name,
    ownerUserId: data.owner_user_id,
    type: data.type,
  } as const;
}

function mapProjectCreateError(error: { code?: string; message?: string }) {
  if (error.code === "23505") {
    return new ProjectServiceError(
      "project_slug_taken",
      PROJECT_SLUG_TAKEN_MESSAGE,
      409,
    );
  }

  return new ProjectServiceError(
    "project_create_failed",
    PROJECT_CREATE_FAILED_MESSAGE,
    500,
  );
}

function mapProjectSummary(options: {
  canvas: {
    id: string;
    is_primary: boolean;
    name: string;
  };
  project: {
    created_at: string;
    description: string | null;
    id: string;
    name: string;
    slug: string;
    updated_at: string;
  };
  thumbnailUrl?: string | null;
  workspace: {
    id: string;
    name: string;
    ownerUserId: string;
    type: "personal" | "team";
  };
}): ProjectSummary {
  return {
    createdAt: options.project.created_at,
    description: options.project.description,
    id: options.project.id,
    name: options.project.name,
    primaryCanvas: {
      id: options.canvas.id,
      isPrimary: options.canvas.is_primary,
      name: options.canvas.name,
    },
    slug: options.project.slug,
    ...(options.thumbnailUrl ? { thumbnailUrl: options.thumbnailUrl } : {}),
    updatedAt: options.project.updated_at,
    workspace: {
      id: options.workspace.id,
      name: options.workspace.name,
      ownerUserId: options.workspace.ownerUserId,
      type: options.workspace.type,
    },
  };
}

function normalizeDescription(description: string | undefined) {
  const normalized = description?.trim();
  return normalized || null;
}

function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : `project-${suffix}`;
}

async function generateThumbnailUrls(
  client: UserSupabaseClient,
  projects: Array<{ id: string; thumbnail_path: string | null }>,
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  if (projects.length === 0) return urlMap;

  const pathToProjectId = new Map(
    projects
      .filter((p): p is typeof p & { thumbnail_path: string } => !!p.thumbnail_path)
      .map((p) => [p.thumbnail_path, p.id]),
  );

  const paths = [...pathToProjectId.keys()];

  const { data } = await client.storage
    .from(THUMBNAIL_BUCKET)
    .createSignedUrls(paths, THUMBNAIL_URL_EXPIRY_SECONDS);

  if (data) {
    for (const entry of data) {
      if (entry.signedUrl && entry.path) {
        const projectId = pathToProjectId.get(entry.path);
        if (projectId) {
          urlMap.set(projectId, entry.signedUrl);
        }
      }
    }
  }

  return urlMap;
}
