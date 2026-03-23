import { afterEach, describe, expect, it } from "vitest";

import {
  applicationErrorResponseSchema,
  projectCreateResponseSchema,
  projectListResponseSchema,
} from "@loomic/shared";

import { buildApp } from "../src/app.js";
import { ProjectServiceError } from "../src/features/projects/project-service.js";
import type { AuthenticatedUser } from "../src/supabase/user.js";

const appsUnderTest = new Set<Awaited<ReturnType<typeof buildApp>>>();

afterEach(async () => {
  await Promise.all(
    [...appsUnderTest].map(async (app) => {
      appsUnderTest.delete(app);
      await app.close();
    }),
  );
});

describe("project routes", () => {
  it("returns only projects for the current workspace member", async () => {
    const authUser = {
      accessToken: "projects-token",
      email: "member@example.com",
      id: "user-member",
      userMetadata: {},
    };
    const projectService = createProjectServiceStub();
    projectService.seed({
      createdAt: "2026-03-23T00:00:00.000Z",
      description: null,
      id: "project-1",
      name: "Member Project",
      ownerUserId: "user-member",
      slug: "member-project",
      updatedAt: "2026-03-23T00:00:00.000Z",
      userId: "user-member",
      workspaceId: "workspace-member",
      workspaceName: "Member Workspace",
    });
    projectService.seed({
      createdAt: "2026-03-23T00:00:01.000Z",
      description: null,
      id: "project-2",
      name: "Other Project",
      ownerUserId: "user-other",
      slug: "other-project",
      updatedAt: "2026-03-23T00:00:01.000Z",
      userId: "user-other",
      workspaceId: "workspace-other",
      workspaceName: "Other Workspace",
    });

    const app = buildProjectsApp({
      auth: createAuthStub(authUser),
      projectService,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(projectListResponseSchema.parse(response.json())).toEqual({
      projects: [
        {
          createdAt: "2026-03-23T00:00:00.000Z",
          description: null,
          id: "project-1",
          name: "Member Project",
          primaryCanvas: {
            id: "canvas-project-1",
            isPrimary: true,
            name: "Main Canvas",
          },
          slug: "member-project",
          updatedAt: "2026-03-23T00:00:00.000Z",
          workspace: {
            id: "workspace-member",
            name: "Member Workspace",
            ownerUserId: "user-member",
            type: "personal",
          },
        },
      ],
    });
  });

  it("creates a project and its primary canvas", async () => {
    const authUser = {
      accessToken: "create-token",
      email: "member@example.com",
      id: "user-member",
      userMetadata: {},
    };
    const projectService = createProjectServiceStub();
    projectService.addMembership({
      ownerUserId: "user-member",
      userId: "user-member",
      workspaceId: "workspace-member",
      workspaceName: "Member Workspace",
    });
    const app = buildProjectsApp({
      auth: createAuthStub(authUser),
      projectService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
      payload: {
        description: "Created from route test",
        name: "New Project",
      },
    });

    expect(response.statusCode).toBe(201);
    const payload = projectCreateResponseSchema.parse(response.json());
    expect(payload.project.name).toBe("New Project");
    expect(payload.project.slug).toBe("new-project");
    expect(payload.project.primaryCanvas).toEqual({
      id: `canvas-${payload.project.id}`,
      isPrimary: true,
      name: "Main Canvas",
    });
    expect(projectService.snapshot()).toEqual({
      canvasCount: 1,
      membershipCount: 1,
      projectCount: 1,
    });
  });

  it("returns a stable application error when the project slug is already taken", async () => {
    const authUser = {
      accessToken: "duplicate-token",
      email: "member@example.com",
      id: "user-member",
      userMetadata: {},
    };
    const app = buildProjectsApp({
      auth: createAuthStub(authUser),
      projectService: {
        async createProject() {
          throw new ProjectServiceError(
            "project_slug_taken",
            "Project slug is already taken in this workspace.",
            409,
          );
        },
        async listProjects() {
          return [];
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: {
        authorization: `Bearer ${authUser.accessToken}`,
      },
      payload: {
        name: "Already Taken",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(applicationErrorResponseSchema.parse(response.json())).toEqual({
      error: {
        code: "project_slug_taken",
        message: "Project slug is already taken in this workspace.",
      },
    });
    expect(response.body).not.toContain("projects_workspace_slug_key");
    expect(response.body).not.toContain("duplicate key value");
  });
});

function buildProjectsApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof buildApp>> {
  const app = buildApp({
    env: {
      port: 3001,
      version: "9.9.9-test",
      webOrigin: "http://localhost:3000",
    },
    ...overrides,
  });
  appsUnderTest.add(app);
  return app;
}

function createAuthStub(user: {
  accessToken: string;
  email: string;
  id: string;
  userMetadata: Record<string, unknown>;
}) {
  return {
    async authenticate(request: { headers: { authorization?: string } }) {
      if (request.headers.authorization === `Bearer ${user.accessToken}`) {
        return user;
      }

      return null;
    },
  };
}

function createProjectServiceStub() {
  const memberships = new Map<
    string,
    {
      ownerUserId: string;
      userId: string;
      workspaceId: string;
      workspaceName: string;
    }
  >();
  const projects = new Map<
    string,
    {
      createdAt: string;
      description: string | null;
      id: string;
      name: string;
      ownerUserId: string;
      slug: string;
      updatedAt: string;
      userId: string;
      workspaceId: string;
      workspaceName: string;
    }
  >();
  const canvases = new Map<
    string,
    {
      id: string;
      isPrimary: boolean;
      name: string;
      projectId: string;
    }
  >();

  return {
    addMembership(membership: {
      ownerUserId: string;
      userId: string;
      workspaceId: string;
      workspaceName: string;
    }) {
      memberships.set(membership.userId, membership);
    },
    async createProject(
      user: AuthenticatedUser,
      input: { description?: string; name: string },
    ) {
      const membership = memberships.get(user.id);
      if (!membership) {
        throw new Error(`No membership found for ${user.id}`);
      }

      const slug = slugify(input.name);
      for (const project of projects.values()) {
        if (
          project.workspaceId === membership.workspaceId &&
          project.slug === slug
        ) {
          throw new Error(
            'duplicate key value violates unique constraint "projects_workspace_slug_key"',
          );
        }
      }

      const id = `project-${projects.size + 1}`;
      const canvasId = `canvas-${id}`;
      const timestamp = `2026-03-23T00:00:0${projects.size}.000Z`;
      const project = {
        createdAt: timestamp,
        description: input.description ?? null,
        id,
        name: input.name,
        ownerUserId: membership.ownerUserId,
        slug,
        updatedAt: timestamp,
        userId: user.id,
        workspaceId: membership.workspaceId,
        workspaceName: membership.workspaceName,
      };

      projects.set(id, project);
      canvases.set(canvasId, {
        id: canvasId,
        isPrimary: true,
        name: "Main Canvas",
        projectId: id,
      });

      return mapProject(project, canvases.get(canvasId)!);
    },
    async listProjects(user: AuthenticatedUser) {
      return [...projects.values()]
        .filter((project) => project.userId === user.id)
        .map((project) =>
          mapProject(
            project,
            [...canvases.values()].find(
              (canvas) => canvas.projectId === project.id && canvas.isPrimary,
            )!,
          ),
        );
    },
    seed(project: {
      createdAt: string;
      description: string | null;
      id: string;
      name: string;
      ownerUserId: string;
      slug: string;
      updatedAt: string;
      userId: string;
      workspaceId: string;
      workspaceName: string;
    }) {
      memberships.set(project.userId, {
        ownerUserId: project.ownerUserId,
        userId: project.userId,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName,
      });
      projects.set(project.id, project);
      canvases.set(`canvas-${project.id}`, {
        id: `canvas-${project.id}`,
        isPrimary: true,
        name: "Main Canvas",
        projectId: project.id,
      });
    },
    snapshot() {
      return {
        canvasCount: canvases.size,
        membershipCount: memberships.size,
        projectCount: projects.size,
      };
    },
  };
}

function mapProject(
  project: {
    createdAt: string;
    description: string | null;
    id: string;
    name: string;
    ownerUserId: string;
    slug: string;
    updatedAt: string;
    workspaceId: string;
    workspaceName: string;
  },
  canvas: {
    id: string;
    isPrimary: boolean;
    name: string;
  },
) {
  return {
    createdAt: project.createdAt,
    description: project.description,
    id: project.id,
    name: project.name,
    primaryCanvas: {
      id: canvas.id,
      isPrimary: canvas.isPrimary,
      name: canvas.name,
    },
    slug: project.slug,
    updatedAt: project.updatedAt,
    workspace: {
      id: project.workspaceId,
      name: project.workspaceName,
      ownerUserId: project.ownerUserId,
      type: "personal" as const,
    },
  };
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
