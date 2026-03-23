import { describe, expect, it } from "vitest";

import {
  createProjectService,
  ProjectServiceError,
} from "../src/features/projects/project-service.js";
import { BootstrapError } from "../src/features/bootstrap/ensure-user-foundation.js";

describe("createProjectService", () => {
  it("calls ensureViewer before listing projects", async () => {
    const calls: string[] = [];
    const user = mockUser("user-1");
    const service = createProjectService({
      createUserClient: () =>
        createMockUserClient({
          workspace: mockWorkspace("ws-1", "user-1"),
          projects: [],
          canvases: [],
        }) as any,
      viewerService: {
        async ensureViewer() {
          calls.push("ensureViewer");
          return mockViewerResponse("user-1", "ws-1");
        },
      },
    });

    await service.listProjects(user);
    expect(calls).toContain("ensureViewer");
  });

  it("calls ensureViewer before creating a project", async () => {
    const calls: string[] = [];
    const user = mockUser("user-1");
    const rpcResult = {
      project: {
        id: "proj-1",
        name: "My Project",
        slug: "my-project",
        description: null,
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
        workspace_id: "ws-1",
      },
      canvas: { id: "canvas-1", name: "Main Canvas", is_primary: true },
    };

    const service = createProjectService({
      createUserClient: () =>
        createMockUserClient({
          workspace: mockWorkspace("ws-1", "user-1"),
          rpcResult: { data: rpcResult, error: null },
        }) as any,
      viewerService: {
        async ensureViewer() {
          calls.push("ensureViewer");
          return mockViewerResponse("user-1", "ws-1");
        },
      },
    });

    await service.createProject(user, { name: "My Project" });
    expect(calls).toContain("ensureViewer");
  });

  it("uses create_project_with_canvas RPC for atomic creation", async () => {
    const rpcCalls: unknown[] = [];
    const user = mockUser("user-1");
    const rpcResult = {
      project: {
        id: "proj-1",
        name: "Test",
        slug: "test",
        description: null,
        created_at: "2026-03-23T00:00:00.000Z",
        updated_at: "2026-03-23T00:00:00.000Z",
        workspace_id: "ws-1",
      },
      canvas: { id: "canvas-1", name: "Main Canvas", is_primary: true },
    };

    const service = createProjectService({
      createUserClient: () =>
        createMockUserClient({
          workspace: mockWorkspace("ws-1", "user-1"),
          rpcResult: { data: rpcResult, error: null },
          onRpc(name, params) {
            rpcCalls.push({ name, params });
          },
        }) as any,
      viewerService: {
        async ensureViewer() {
          return mockViewerResponse("user-1", "ws-1");
        },
      },
    });

    const result = await service.createProject(user, { name: "Test" });

    expect(rpcCalls).toEqual([
      {
        name: "create_project_with_canvas",
        params: {
          p_workspace_id: "ws-1",
          p_name: "Test",
          p_slug: "test",
          p_description: null,
          p_canvas_name: "Main Canvas",
        },
      },
    ]);
    expect(result.id).toBe("proj-1");
    expect(result.primaryCanvas.id).toBe("canvas-1");
  });

  it("maps 23505 unique violation to project_slug_taken error", async () => {
    const user = mockUser("user-1");
    const service = createProjectService({
      createUserClient: () =>
        createMockUserClient({
          workspace: mockWorkspace("ws-1", "user-1"),
          rpcResult: {
            data: null,
            error: { code: "23505", message: "unique" },
          },
        }) as any,
      viewerService: {
        async ensureViewer() {
          return mockViewerResponse("user-1", "ws-1");
        },
      },
    });

    await expect(
      service.createProject(user, { name: "Duplicate" }),
    ).rejects.toMatchObject({
      code: "project_slug_taken",
      statusCode: 409,
    });
  });

  it("wraps BootstrapError into ProjectServiceError during createProject", async () => {
    const user = mockUser("user-1");
    const service = createProjectService({
      createUserClient: () => createMockUserClient({}) as any,
      viewerService: {
        async ensureViewer() {
          throw new BootstrapError();
        },
      },
    });

    await expect(
      service.createProject(user, { name: "Fail" }),
    ).rejects.toBeInstanceOf(ProjectServiceError);
  });

  it("wraps BootstrapError into ProjectServiceError during listProjects", async () => {
    const user = mockUser("user-1");
    const service = createProjectService({
      createUserClient: () => createMockUserClient({}) as any,
      viewerService: {
        async ensureViewer() {
          throw new BootstrapError();
        },
      },
    });

    await expect(service.listProjects(user)).rejects.toBeInstanceOf(
      ProjectServiceError,
    );
  });
});

function mockUser(id: string) {
  return {
    accessToken: `token-${id}`,
    email: `${id}@example.com`,
    id,
    userMetadata: {},
  };
}

function mockWorkspace(id: string, ownerId: string) {
  return {
    id,
    name: "Test Workspace",
    owner_user_id: ownerId,
    type: "personal" as const,
  };
}

function mockViewerResponse(userId: string, workspaceId: string) {
  return {
    profile: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: "Test",
      avatarUrl: null,
    },
    workspace: {
      id: workspaceId,
      name: "Test Workspace",
      ownerUserId: userId,
      type: "personal" as const,
    },
    membership: {
      workspaceId,
      userId,
      role: "owner" as const,
    },
  };
}

function createMockUserClient(options: {
  workspace?: Record<string, unknown> | null;
  projects?: Record<string, unknown>[];
  canvases?: Record<string, unknown>[];
  rpcResult?: { data: unknown; error: unknown };
  onRpc?: (name: string, params: unknown) => void;
}) {
  return {
    rpc(name: string, params: unknown) {
      options.onRpc?.(name, params);
      return Promise.resolve(
        options.rpcResult ?? {
          data: null,
          error: { message: "no rpc stub" },
        },
      );
    },
    from(table: string) {
      return createChain(table, options);
    },
  };
}

function createChain(
  table: string,
  options: {
    workspace?: Record<string, unknown> | null;
    projects?: Record<string, unknown>[];
    canvases?: Record<string, unknown>[];
  },
) {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    is() {
      return chain;
    },
    in() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    maybeSingle() {
      if (table === "workspaces") {
        return Promise.resolve({
          data: options.workspace ?? null,
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void,
    ) {
      if (table === "projects") {
        return Promise.resolve({
          data: options.projects ?? [],
          error: null,
        }).then(resolve, reject);
      }
      if (table === "canvases") {
        return Promise.resolve({
          data: options.canvases ?? [],
          error: null,
        }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  return chain;
}
