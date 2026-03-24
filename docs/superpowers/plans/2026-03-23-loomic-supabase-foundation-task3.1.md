# Task 3.1: Supabase Foundation Code Quality Fix Batch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five code quality issues caught during Task 3 review: non-atomic project creation, implicit viewer dependency in projects API, insufficient service-layer test coverage, missing input trim, and profile upsert overwriting user-edited data.

**Architecture:** Add a new Postgres migration with two public RPC functions (`bootstrap_viewer` as a thin wrapper for the private bootstrap function, and `create_project_with_canvas` for atomic project+canvas creation). Refactor `ensureViewer` to delegate to `bootstrap_viewer` RPC. Inject `ViewerService` into `ProjectService` so every project endpoint self-bootstraps. Update the generated `Database` types to include the new function signatures. Tighten the Zod request schema with `.trim()`. Add service-layer unit tests with lightweight Supabase client mocks.

**Tech Stack:** `TypeScript`, `Fastify`, `Supabase Postgres`, `Zod`, `Vitest`, `pnpm`.

---

### Task 1: Add migration with `bootstrap_viewer` wrapper and atomic `create_project_with_canvas` RPC

**Why:** (1) `private.bootstrap_user_foundation` cannot be called via Supabase JS `.rpc()` because PostgREST only exposes `public` schema functions — we need a thin `public` wrapper. (2) `project-service.ts:53-87` does two independent INSERTs (project, then canvas); if the canvas INSERT fails, a manual DELETE attempts cleanup but can itself fail, leaving orphan projects. A single Postgres function wrapping both INSERTs in one transaction eliminates this risk.

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/supabase/migrations/20260323_000003_atomic_rpc_functions.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Task 3.1: Public RPC functions for server-side business operations.
--
-- 1. bootstrap_viewer: thin public wrapper for private.bootstrap_user_foundation
--    so apps/server can call it via Supabase JS .rpc() through PostgREST.
--
-- 2. create_project_with_canvas: atomic project + primary canvas creation
--    in a single transaction, eliminating orphan-project risk.

-- ============================================================
-- 1. bootstrap_viewer (public wrapper)
-- ============================================================

create or replace function public.bootstrap_viewer(
  p_user_id uuid,
  p_email text,
  p_user_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.bootstrap_user_foundation(p_user_id, p_email, p_user_meta);
end;
$$;

revoke all on function public.bootstrap_viewer(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bootstrap_viewer(uuid, text, jsonb)
  to service_role;

-- Only the service-role key should call this; individual users
-- are bootstrapped by the auth.users INSERT trigger instead.
-- No GRANT to authenticated — called via admin client (service_role) only.

-- ============================================================
-- 2. create_project_with_canvas (atomic creation)
-- ============================================================

create or replace function public.create_project_with_canvas(
  p_workspace_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_canvas_name text default 'Main Canvas'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_project_id uuid;
  v_canvas_id uuid;
  v_project record;
  v_canvas record;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if not private.is_workspace_admin_or_owner(p_workspace_id) then
    raise exception 'Not an admin or owner of this workspace'
      using errcode = '42501';
  end if;

  insert into public.projects (workspace_id, name, slug, description, created_by)
  values (p_workspace_id, p_name, p_slug, p_description, v_user_id)
  returning id into v_project_id;

  insert into public.canvases (project_id, name, is_primary, created_by)
  values (v_project_id, p_canvas_name, true, v_user_id)
  returning id into v_canvas_id;

  select id, name, slug, description, created_at, updated_at, workspace_id
  into v_project
  from public.projects
  where id = v_project_id;

  select id, name, is_primary
  into v_canvas
  from public.canvases
  where id = v_canvas_id;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'slug', v_project.slug,
      'description', v_project.description,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'workspace_id', v_project.workspace_id
    ),
    'canvas', jsonb_build_object(
      'id', v_canvas.id,
      'name', v_canvas.name,
      'is_primary', v_canvas.is_primary
    )
  );
end;
$$;

revoke all on function public.create_project_with_canvas(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_project_with_canvas(uuid, text, text, text, text)
  to authenticated;
```

- [ ] **Step 2: Verify the SQL reads cleanly**

Confirm:
- `bootstrap_viewer` delegates to `private.bootstrap_user_foundation` and has NO grant to `authenticated` (admin-only call via service role).
- `create_project_with_canvas` validates auth + workspace admin/owner, both INSERTs are in one function body (one implicit transaction), and is granted to `authenticated`.
- Authorization uses `is_workspace_admin_or_owner` to match the hardened RLS policy from migration 000002.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260323_000003_atomic_rpc_functions.sql
git commit -m "feat: add bootstrap_viewer and create_project_with_canvas RPC functions"
```

---

### Task 2: Update `Database` types with new RPC function signatures

**Why:** The current `database.ts` has `Functions: { [_ in never]: never }`. Any `.rpc()` call on a typed `SupabaseClient<Database>` will fail `pnpm typecheck` unless the functions are declared. This must happen before Tasks 3-4 which use the RPCs in typed TypeScript.

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/supabase/database.ts`

- [ ] **Step 1: Update the Functions section**

Replace lines 235-237 in `database.ts`:

```typescript
    Functions: {
      bootstrap_viewer: {
        Args: {
          p_user_id: string
          p_email: string
          p_user_meta: Json
        }
        Returns: string
      }
      create_project_with_canvas: {
        Args: {
          p_workspace_id: string
          p_name: string
          p_slug: string
          p_description: string | null
          p_canvas_name: string
        }
        Returns: Json
      }
    }
```

- [ ] **Step 2: Run typecheck to verify the types compile**

Run:
```bash
pnpm --filter @loomic/shared typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/supabase/database.ts
git commit -m "chore: add RPC function types to Database definition"
```

---

### Task 3: Refactor `ensureViewer` to use `bootstrap_viewer` RPC

**Why:** The current `ensureViewer` in `ensure-user-foundation.ts` does an unconditional `.upsert()` on profiles (line 32-43) that overwrites user-edited `display_name` / `avatar_url`. The SQL function `private.bootstrap_user_foundation` (exposed via `public.bootstrap_viewer`) already uses `coalesce(p.display_name, excluded.display_name)` to preserve existing values. Delegating to the RPC eliminates the overwrite bug and reduces duplicated bootstrap logic.

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/bootstrap/ensure-user-foundation.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/viewer-service.test.ts`

- [ ] **Step 1: Write the failing test for profile preservation**

Create `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/viewer-service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createViewerService } from "../src/features/bootstrap/ensure-user-foundation.js";

describe("createViewerService", () => {
  it("calls bootstrap_viewer RPC instead of raw profile upsert", async () => {
    const rpcCalls: unknown[] = [];
    const workspaceId = "ws-1";
    const admin = createMockAdminClient({
      rpcResult: { data: workspaceId, error: null },
      onRpc(name, params) {
        rpcCalls.push({ name, params });
      },
      profile: {
        avatar_url: "https://example.com/custom-avatar.png",
        display_name: "Custom Name",
        email: "ada@example.com",
        id: "user-ada",
      },
      workspace: {
        id: workspaceId,
        name: "Custom Name Workspace",
        owner_user_id: "user-ada",
        type: "personal",
      },
      membership: {
        role: "owner",
        user_id: "user-ada",
        workspace_id: workspaceId,
      },
    });

    const service = createViewerService({ getAdminClient: () => admin as any });
    const result = await service.ensureViewer({
      accessToken: "token",
      email: "ada@example.com",
      id: "user-ada",
      userMetadata: {
        avatar_url: "https://example.com/old-avatar.png",
        full_name: "Ada Lovelace",
      },
    });

    expect(rpcCalls).toEqual([
      {
        name: "bootstrap_viewer",
        params: {
          p_user_id: "user-ada",
          p_email: "ada@example.com",
          p_user_meta: {
            avatar_url: "https://example.com/old-avatar.png",
            full_name: "Ada Lovelace",
          },
        },
      },
    ]);
    // Profile values come from DB (which preserves user-edited data),
    // not from auth metadata.
    expect(result.profile.displayName).toBe("Custom Name");
    expect(result.profile.avatarUrl).toBe(
      "https://example.com/custom-avatar.png",
    );
  });

  it("throws BootstrapError when RPC fails", async () => {
    const admin = createMockAdminClient({
      rpcResult: { data: null, error: { message: "rpc failed" } },
      profile: null,
      workspace: null,
      membership: null,
    });

    const service = createViewerService({ getAdminClient: () => admin as any });

    await expect(
      service.ensureViewer({
        accessToken: "token",
        email: "fail@example.com",
        id: "user-fail",
        userMetadata: {},
      }),
    ).rejects.toThrow("Unable to prepare viewer workspace.");
  });

  it("throws BootstrapError when workspace not found after bootstrap", async () => {
    const admin = createMockAdminClient({
      rpcResult: { data: "ws-1", error: null },
      profile: {
        avatar_url: null,
        display_name: "Test",
        email: "test@example.com",
        id: "user-test",
      },
      workspace: null,
      membership: null,
    });

    const service = createViewerService({ getAdminClient: () => admin as any });

    await expect(
      service.ensureViewer({
        accessToken: "token",
        email: "test@example.com",
        id: "user-test",
        userMetadata: {},
      }),
    ).rejects.toThrow("Unable to prepare viewer workspace.");
  });
});

function createMockAdminClient(options: {
  rpcResult: { data: unknown; error: unknown };
  onRpc?: (name: string, params: unknown) => void;
  profile: Record<string, unknown> | null;
  workspace: Record<string, unknown> | null;
  membership: Record<string, unknown> | null;
}) {
  return {
    rpc(name: string, params: unknown) {
      options.onRpc?.(name, params);
      return Promise.resolve(options.rpcResult);
    },
    from(table: string) {
      return createMockQueryBuilder(table, options);
    },
  };
}

function createMockQueryBuilder(
  table: string,
  options: {
    profile: Record<string, unknown> | null;
    workspace: Record<string, unknown> | null;
    membership: Record<string, unknown> | null;
  },
) {
  const chain: Record<string, unknown> = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    single() {
      const dataMap: Record<string, unknown> = {
        profiles: options.profile,
        workspaces: options.workspace,
        workspace_members: options.membership,
      };
      const data = dataMap[table] ?? null;
      return Promise.resolve({
        data,
        error: data ? null : { message: `${table} not found` },
      });
    },
    maybeSingle() {
      const dataMap: Record<string, unknown> = {
        profiles: options.profile,
        workspaces: options.workspace,
        workspace_members: options.membership,
      };
      const data = dataMap[table] ?? null;
      return Promise.resolve({ data, error: null });
    },
  };
  return chain;
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @loomic/server test -- viewer-service.test.ts
```

Expected: FAIL — the current `ensureViewer` does not call `.rpc("bootstrap_viewer", ...)`. The test will fail because `rpcCalls` is empty and assertion `expect(rpcCalls).toEqual([...])` fails.

Note: The old code will throw a TypeError when trying to call `.from("profiles").upsert(...)` since the mock doesn't include `upsert()`. This is acceptable for a red-green refactor — the test confirms the old code path does not match the new expected behavior.

- [ ] **Step 3: Rewrite `ensureViewer` to use the bootstrap RPC**

Replace the full content of `ensure-user-foundation.ts`:

```typescript
import {
  type ViewerResponse,
  viewerResponseSchema,
} from "@loomic/shared";

import type { AdminSupabaseClient } from "../../supabase/admin.js";
import type { AuthenticatedUser } from "../../supabase/user.js";

const BOOTSTRAP_FAILED_MESSAGE = "Unable to prepare viewer workspace.";

export type ViewerService = {
  ensureViewer(user: AuthenticatedUser): Promise<ViewerResponse>;
};

export class BootstrapError extends Error {
  readonly code = "bootstrap_failed";
  readonly statusCode = 500;

  constructor() {
    super(BOOTSTRAP_FAILED_MESSAGE);
  }
}

export function createViewerService(options: {
  getAdminClient: () => AdminSupabaseClient;
}): ViewerService {
  return {
    async ensureViewer(user) {
      const admin = options.getAdminClient();

      const { error: rpcError } = await admin.rpc("bootstrap_viewer", {
        p_user_id: user.id,
        p_email: user.email,
        p_user_meta: user.userMetadata as import("@loomic/shared").Json,
      });

      if (rpcError) {
        throw new BootstrapError();
      }

      const workspace = await loadPersonalWorkspace(admin, user.id);

      if (!workspace) {
        throw new BootstrapError();
      }

      const [profile, membership] = await Promise.all([
        loadProfile(admin, user.id),
        loadMembership(admin, workspace.id, user.id),
      ]);

      if (!profile || !membership) {
        throw new BootstrapError();
      }

      return viewerResponseSchema.parse({
        membership,
        profile,
        workspace,
      });
    },
  };
}

async function loadPersonalWorkspace(
  admin: AdminSupabaseClient,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name, type, owner_user_id")
    .eq("owner_user_id", userId)
    .eq("type", "personal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    ownerUserId: data.owner_user_id,
    type: data.type,
  } as const;
}

async function loadProfile(admin: AdminSupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    avatarUrl: data.avatar_url ?? null,
    displayName: data.display_name ?? "Personal",
    email: data.email ?? "",
    id: data.id,
  } as const;
}

async function loadMembership(
  admin: AdminSupabaseClient,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    role: data.role,
    userId: data.user_id,
    workspaceId: data.workspace_id,
  } as const;
}
```

Key changes from the original:
- Removed `buildProfileSeed`, `ensurePersonalWorkspace`, `ensureWorkspaceMembership`, `normalizeOptionalString`, `isUniqueViolation` — all of this logic now lives in the SQL RPC.
- `loadProfile` no longer takes a `profileSeed` fallback — values come from what the DB actually holds (preserving user-edited data).
- `ensureViewer` calls `admin.rpc("bootstrap_viewer", ...)` once, then reads back the state.
- Null checks return `null` instead of throwing, and `ensureViewer` throws `BootstrapError` centrally.

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @loomic/server test -- viewer-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/features/bootstrap/ensure-user-foundation.ts apps/server/test/viewer-service.test.ts
git commit -m "fix: use bootstrap_viewer RPC to prevent profile overwrite on ensureViewer"
```

---

### Task 4: Refactor `ProjectService` to use atomic RPC and self-bootstrap foundation

**Why:** Two problems — (1) non-atomic project+canvas creation, and (2) `/api/projects` fails if `/api/viewer` hasn't been called first. Fix (1) by calling `create_project_with_canvas` RPC. Fix (2) by injecting `ViewerService` and calling `ensureViewer` at the start of each method. Additionally, wrap `BootstrapError` from `ensureViewer` into `ProjectServiceError` so project route error handling produces correct error codes.

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/projects/project-service.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/app.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/project-service.test.ts`

- [ ] **Step 1: Write the failing tests for the new behavior**

Create `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/project-service.test.ts`:

```typescript
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
  let resolvedData: unknown = null;

  const chain = {
    select() {
      return chain;
    },
    eq(_col: string, value: unknown) {
      // For canvases eq("is_primary", true), filter canvases
      if (table === "canvases" && _col === "is_primary") {
        resolvedData = (options.canvases ?? []).filter(
          (c: any) => c.is_primary === value,
        );
      }
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
          data: resolvedData ?? options.canvases ?? [],
          error: null,
        }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  return chain;
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @loomic/server test -- project-service.test.ts
```

Expected: FAIL because `createProjectService` does not accept `viewerService`, does not call `ensureViewer`, and does not use `rpc`.

- [ ] **Step 3: Update `createProjectService` signature and implementation**

Replace the full content of `project-service.ts`:

```typescript
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
const PROJECT_SLUG_TAKEN_MESSAGE =
  "Project slug is already taken in this workspace.";

export type ProjectService = {
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
    | "project_query_failed"
    | "project_slug_taken";

  constructor(
    code:
      | "project_create_failed"
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
```

Key changes from the original:
- `createProjectService` now requires `viewerService` in its options.
- Both `listProjects` and `createProject` call `ensureFoundation()` first.
- `ensureFoundation()` wraps `BootstrapError` into `ProjectServiceError` so project route error handling produces correct error codes.
- `createProject` uses `client.rpc("create_project_with_canvas", ...)` instead of two separate INSERTs.
- Removed the manual delete-on-canvas-failure cleanup code.

- [ ] **Step 4: Update `app.ts` to pass `viewerService` into `createProjectService`**

In `app.ts`, change lines 59-62 from:

```typescript
  const viewerService =
    options.viewerService ?? createViewerService({ getAdminClient });
  const projectService =
    options.projectService ?? createProjectService({ createUserClient });
```

To:

```typescript
  const viewerService =
    options.viewerService ?? createViewerService({ getAdminClient });
  const projectService =
    options.projectService ??
    createProjectService({ createUserClient, viewerService });
```

Only the `createProjectService(...)` call changes — `viewerService` is added to its options.

- [ ] **Step 5: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @loomic/server test -- project-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/features/projects/project-service.ts apps/server/src/app.ts apps/server/test/project-service.test.ts
git commit -m "fix: atomic project creation via RPC and self-bootstrap foundation"
```

---

### Task 5: Add `.trim()` to `projectCreateRequestSchema`

**Why:** `packages/shared/src/http.ts:33` — `name: z.string().min(1)` lets pure whitespace `"   "` through, which then hits the DB constraint `check (char_length(btrim(name)) > 0)` and returns a raw 500 instead of a proper 400 validation error.

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/http.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the following tests **inside** the existing `describe("@loomic/shared contracts", ...)` block in `contracts.test.ts`, after the existing `"rejects an empty project name"` test (after line 167):

```typescript
  it("rejects a whitespace-only project name", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("trims a valid project name", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({ name: "  My Project  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Project");
    }
  });

  it("trims a valid project description", () => {
    const schema = getExportedSchema("projectCreateRequestSchema");
    const result = schema.safeParse({
      name: "Test",
      description: "  Some desc  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("Some desc");
    }
  });
```

Note: Uses the existing `getExportedSchema` helper and is nested inside the existing `describe` block to match the file's established pattern.

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
pnpm --filter @loomic/shared test -- contracts.test.ts
```

Expected: FAIL — `"rejects a whitespace-only project name"` passes the current `z.string().min(1)` validation. `"trims a valid project name"` fails because `result.data.name` is `"  My Project  "` (untrimmed).

- [ ] **Step 3: Update the schema**

In `packages/shared/src/http.ts`, change lines 32-35 from:

```typescript
export const projectCreateRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
```

To:

```typescript
export const projectCreateRequestSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @loomic/shared test -- contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/http.ts packages/shared/src/contracts.test.ts
git commit -m "fix: trim projectCreateRequestSchema name to prevent whitespace 500"
```

---

### Task 6: Update route tests for compatibility and run full suite

**Why:** After Tasks 3-4 changed the `createProjectService` signature (now requires `viewerService`), the route tests inject `projectService` directly as a `BuildAppOptions` override — they bypass `createProjectService` entirely. They should still work because `buildApp` falls through to the injected stub. But we need to verify, and also ensure the entire repo passes lint/typecheck/test/build.

**Files:**
- Possibly modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/projects-routes.test.ts` (only if needed)

- [ ] **Step 1: Run the existing route tests**

Run:
```bash
pnpm --filter @loomic/server test -- viewer-routes.test.ts
pnpm --filter @loomic/server test -- projects-routes.test.ts
```

If they pass as-is (because route tests inject `projectService` / `viewerService` directly via `BuildAppOptions`, bypassing `createProjectService`), no changes needed. If they fail due to changes in `buildApp` or service types, update the test helpers to match.

- [ ] **Step 2: Run the full server test suite**

Run:
```bash
pnpm --filter @loomic/server test
```

Expected: All tests PASS.

- [ ] **Step 3: Run typecheck across the repo**

Run:
```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the full repo test + build**

Run:
```bash
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit (only if route test changes were needed)**

```bash
git add apps/server/test/projects-routes.test.ts apps/server/test/viewer-routes.test.ts
git commit -m "test: update route tests for new service signatures"
```

---

### Task 7: Apply migration to hosted Supabase project and smoke-test

**Why:** The `bootstrap_viewer` and `create_project_with_canvas` RPC functions must exist in the remote database before the updated server code can call them.

**Files:**
- Apply: `/Users/nowcoder/Desktop/auto-code-work/Loomic/supabase/migrations/20260323_000003_atomic_rpc_functions.sql`

- [ ] **Step 1: Apply the migration**

Use the Supabase MCP or dashboard to apply `20260323_000003_atomic_rpc_functions.sql` to project ref `ndbwtngvypwgqexcirdo`.

- [ ] **Step 2: Verify the functions exist**

Query the Supabase project to confirm both `public.bootstrap_viewer` and `public.create_project_with_canvas` are listed as functions.

- [ ] **Step 3: Smoke-test the server against the live project**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
set -a; source .env.local; set +a; pnpm --filter @loomic/server dev
```

Verify:
- `GET /api/viewer` with a valid token bootstraps correctly (profile values preserved from DB)
- `GET /api/projects` works even for a user who has never called `/api/viewer` before
- `POST /api/projects` creates project + canvas atomically
- `POST /api/projects` with name `"   "` returns 400, not 500

- [ ] **Step 4: No additional commit needed**

The migration was committed in Task 1. The deployment verification is a runtime check only.
