import type {
  ProjectCreateRequest,
  ProjectSummary,
} from "@loomic/shared";

import {
  BootstrapError,
  type ViewerService,
} from "../bootstrap/ensure-user-foundation.js";
import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

const PROJECT_QUERY_FAILED_MESSAGE = "Unable to load projects.";
const PROJECT_CREATE_FAILED_MESSAGE = "Unable to create project.";
const PROJECT_DELETE_FAILED_MESSAGE = "Unable to delete project.";
const PROJECT_NOT_FOUND_MESSAGE = "Project not found.";
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
  listProjects(user: AuthenticatedUser): Promise<ProjectSummary[]>;
};

export class ProjectServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "project_create_failed"
    | "project_delete_failed"
    | "project_not_found"
    | "project_query_failed"
    | "project_slug_taken";

  constructor(
    code:
      | "project_create_failed"
      | "project_delete_failed"
      | "project_not_found"
      | "project_query_failed"
      | "project_slug_taken",
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
      await ensureFoundation(options.viewerService, user, "project_query_failed");

      const client = options.createUserClient(user.accessToken);
      const workspace = await resolvePersonalWorkspace(
        client,
        user.id,
        "project_query_failed",
      );
      const { data: projects, error: projectQueryError } = await client
        .from("projects")
        .select(
          "id, name, slug, description, created_at, updated_at, workspace_id",
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
          workspace,
        });
      });
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
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}
