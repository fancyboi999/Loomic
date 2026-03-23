# Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excalidraw-powered canvas editor to Loomic with Supabase persistence, enabling users to open a project's canvas, draw, and auto-save.

**Architecture:** Next.js dynamic route → CanvasEditor component (Excalidraw) → server canvas API → Supabase `canvases.content` JSONB.

**Tech Stack:** `@excalidraw/excalidraw`, Next.js 15 App Router, Fastify, Supabase, Zod.

---

### Task 1: Add canvas content contracts and Supabase migration

**Files:**
- Modify: `packages/shared/src/contracts.ts`
- Modify: `packages/shared/src/http.ts`
- Modify: `packages/shared/src/index.ts` (if needed for re-exports)
- Create: `supabase/migrations/20260323000004_canvas_content.sql`

- [ ] **Step 1: Add canvas content schemas to contracts.ts**

Add to `packages/shared/src/contracts.ts`:
```typescript
export const canvasContentSchema = z.object({
  elements: z.array(z.record(z.unknown())).default([]),
  appState: z.record(z.unknown()).default({}),
});

export type CanvasContent = z.infer<typeof canvasContentSchema>;

export const canvasDetailSchema = z.object({
  id: canvasIdSchema,
  name: z.string().min(1),
  projectId: projectIdSchema,
  content: canvasContentSchema,
});

export type CanvasDetail = z.infer<typeof canvasDetailSchema>;
```

- [ ] **Step 2: Add canvas HTTP schemas to http.ts**

Add to `packages/shared/src/http.ts`:
```typescript
import { canvasContentSchema, canvasDetailSchema } from "./contracts.js";

export const canvasGetResponseSchema = z.object({
  canvas: canvasDetailSchema,
});

export const canvasSaveRequestSchema = z.object({
  content: canvasContentSchema,
});

export const canvasSaveResponseSchema = z.object({
  ok: z.literal(true),
});

// Add to applicationErrorCodeSchema enum:
// "canvas_not_found", "canvas_save_failed"
```

Update `applicationErrorCodeSchema` to include new codes.

- [ ] **Step 3: Ensure types are re-exported from shared index**

Check `packages/shared/src/index.ts` and add any missing re-exports for new types.

- [ ] **Step 4: Create Supabase migration**

Create `supabase/migrations/20260323000004_canvas_content.sql`:
```sql
ALTER TABLE public.canvases
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.canvases.content IS
  'Excalidraw canvas state: { elements: [], appState: {} }';
```

- [ ] **Step 5: Rebuild shared package**

Run: `pnpm --filter @loomic/shared build`

- [ ] **Step 6: Run existing tests to verify no regressions**

Run: `pnpm test`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/ supabase/migrations/
git commit -m "feat: add canvas content schema and Supabase migration"
```

---

### Task 2: Add server canvas service and routes

**Files:**
- Create: `apps/server/src/features/canvas/canvas-service.ts`
- Create: `apps/server/src/http/canvases.ts`
- Modify: `apps/server/src/app.ts` — register canvas routes, update CORS methods
- Create: `apps/server/test/canvas-service.test.ts`
- Create: `apps/server/test/canvas-routes.test.ts`

- [ ] **Step 1: Write the failing canvas service test**

Create `apps/server/test/canvas-service.test.ts`:
```typescript
import { describe, expect, it, vi } from "vitest";

import { createCanvasService } from "../src/features/canvas/canvas-service.js";

function mockClient(overrides: Record<string, unknown> = {}) {
  const single = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq2 = vi.fn().mockReturnValue({ single });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select, update: vi.fn() });
  return { from, ...overrides, _mocks: { from, select, eq1, eq2, single } };
}

describe("CanvasService", () => {
  it("getCanvas returns canvas detail", async () => {
    const client = mockClient();
    client._mocks.single.mockResolvedValue({
      data: {
        id: "c1",
        name: "Main Canvas",
        project_id: "p1",
        content: { elements: [], appState: {} },
      },
      error: null,
    });

    const service = createCanvasService({
      createUserClient: () => client as any,
    });

    const result = await service.getCanvas(
      { id: "u1", accessToken: "tok" },
      "c1",
    );

    expect(result.id).toBe("c1");
    expect(result.name).toBe("Main Canvas");
    expect(result.projectId).toBe("p1");
  });

  it("getCanvas throws for not found", async () => {
    const client = mockClient();
    client._mocks.single.mockResolvedValue({ data: null, error: null });

    const service = createCanvasService({
      createUserClient: () => client as any,
    });

    await expect(
      service.getCanvas({ id: "u1", accessToken: "tok" }, "c1"),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Create canvas service**

Create `apps/server/src/features/canvas/canvas-service.ts`:
```typescript
import type { CanvasContent, CanvasDetail } from "@loomic/shared";
import type { UserSupabaseClient } from "../../supabase/user.js";
import type { AuthenticatedUser } from "../../supabase/user.js";

export class CanvasServiceError extends Error {
  readonly statusCode: number;
  readonly code: "canvas_not_found" | "canvas_save_failed";

  constructor(
    code: "canvas_not_found" | "canvas_save_failed",
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type CanvasService = {
  getCanvas(user: AuthenticatedUser, canvasId: string): Promise<CanvasDetail>;
  saveCanvasContent(
    user: AuthenticatedUser,
    canvasId: string,
    content: CanvasContent,
  ): Promise<void>;
};

export function createCanvasService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): CanvasService {
  return {
    async getCanvas(user, canvasId) {
      const client = options.createUserClient(user.accessToken);
      const { data, error } = await client
        .from("canvases")
        .select("id, name, project_id, content")
        .eq("id", canvasId)
        .single();

      if (error || !data) {
        throw new CanvasServiceError(
          "canvas_not_found",
          "Canvas not found.",
          404,
        );
      }

      return {
        id: data.id,
        name: data.name,
        projectId: data.project_id,
        content: (data.content as CanvasContent) ?? {
          elements: [],
          appState: {},
        },
      };
    },

    async saveCanvasContent(user, canvasId, content) {
      const client = options.createUserClient(user.accessToken);
      const { error } = await client
        .from("canvases")
        .update({ content: content as unknown as Record<string, unknown> })
        .eq("id", canvasId);

      if (error) {
        throw new CanvasServiceError(
          "canvas_save_failed",
          "Unable to save canvas.",
          500,
        );
      }
    },
  };
}
```

- [ ] **Step 3: Write the failing canvas routes test**

Create `apps/server/test/canvas-routes.test.ts` following the pattern in `projects-routes.test.ts` — test GET and PUT endpoints with mock service.

- [ ] **Step 4: Create canvas routes**

Create `apps/server/src/http/canvases.ts`:
```typescript
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  applicationErrorResponseSchema,
  canvasGetResponseSchema,
  canvasSaveRequestSchema,
  canvasSaveResponseSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";
import {
  CanvasServiceError,
  type CanvasService,
} from "../features/canvas/canvas-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerCanvasRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    canvasService: CanvasService;
  },
) {
  app.get<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) {
          return reply.code(401).send(
            unauthenticatedErrorResponseSchema.parse({
              error: { code: "unauthorized", message: "Missing or invalid bearer token." },
            }),
          );
        }
        const canvas = await options.canvasService.getCanvas(
          user,
          request.params.canvasId,
        );
        return reply.code(200).send(canvasGetResponseSchema.parse({ canvas }));
      } catch (error) {
        return sendCanvasError(error, reply);
      }
    },
  );

  app.put<{ Params: { canvasId: string } }>(
    "/api/canvases/:canvasId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) {
          return reply.code(401).send(
            unauthenticatedErrorResponseSchema.parse({
              error: { code: "unauthorized", message: "Missing or invalid bearer token." },
            }),
          );
        }
        const payload = canvasSaveRequestSchema.parse(request.body);
        await options.canvasService.saveCanvasContent(
          user,
          request.params.canvasId,
          payload.content,
        );
        return reply.code(200).send(canvasSaveResponseSchema.parse({ ok: true }));
      } catch (error) {
        return sendCanvasError(error, reply);
      }
    },
  );
}

function sendCanvasError(error: unknown, reply: FastifyReply) {
  if (error instanceof CanvasServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }
  if (error instanceof Error && error.name === "ZodError" && "issues" in error) {
    return reply.code(400).send({
      issues: (error as any).issues,
      message: "Invalid request body",
    });
  }
  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: { code: "application_error", message: "Internal server error." },
    }),
  );
}
```

- [ ] **Step 5: Register canvas routes in app.ts**

In `apps/server/src/app.ts`:
1. Import `registerCanvasRoutes` and `createCanvasService`
2. Create canvas service instance
3. Call `registerCanvasRoutes(app, { auth, canvasService })`
4. Update CORS `access-control-allow-methods` to include `PUT`

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @loomic/server test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/features/canvas/ apps/server/src/http/canvases.ts apps/server/src/app.ts apps/server/test/canvas-*.test.ts
git commit -m "feat: add canvas service and API routes"
```

---

### Task 3: Install Excalidraw and create canvas page

**Files:**
- Create: `apps/web/src/app/canvas/[canvasId]/page.tsx`
- Create: `apps/web/src/components/canvas-editor.tsx`
- Modify: `apps/web/src/lib/server-api.ts` — add canvas API functions
- Modify: `apps/web/package.json` — add `@excalidraw/excalidraw`

- [ ] **Step 1: Install Excalidraw**

```bash
pnpm --filter @loomic/web add @excalidraw/excalidraw
```

- [ ] **Step 2: Add canvas API functions to server-api.ts**

Add to `apps/web/src/lib/server-api.ts`:
```typescript
import type { CanvasContent } from "@loomic/shared";

// Add to existing imports from @loomic/shared

export async function fetchCanvas(
  accessToken: string,
  canvasId: string,
): Promise<{ canvas: { id: string; name: string; projectId: string; content: CanvasContent } }> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/canvases/${canvasId}`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return response.json();
}

export async function saveCanvas(
  accessToken: string,
  canvasId: string,
  content: CanvasContent,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/canvases/${canvasId}`,
    {
      method: "PUT",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify({ content }),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}
```

- [ ] **Step 3: Create CanvasEditor component**

Create `apps/web/src/components/canvas-editor.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

import type { CanvasContent } from "@loomic/shared";
import { saveCanvas } from "../lib/server-api";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false },
);

type CanvasEditorProps = {
  canvasId: string;
  accessToken: string;
  initialContent: CanvasContent;
};

const SAVE_DEBOUNCE_MS = 1500;

export function CanvasEditor({
  canvasId,
  accessToken,
  initialContent,
}: CanvasEditorProps) {
  const { resolvedTheme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;

  const handleChange = useCallback(
    (elements: readonly any[], appState: any) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const content: CanvasContent = {
          elements: elements.filter((el: any) => !el.isDeleted) as any[],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridModeEnabled: appState.gridModeEnabled,
          },
        };
        saveCanvas(accessTokenRef.current, canvasId, content).catch(
          console.error,
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [canvasId],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <div className="h-full w-full">
      <Excalidraw
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        initialData={{
          elements: initialContent.elements as any,
          appState: initialContent.appState as any,
        }}
        onChange={handleChange}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create canvas page**

Create `apps/web/src/app/canvas/[canvasId]/page.tsx`:
```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { CanvasContent } from "@loomic/shared";
import { useAuth } from "../../../lib/auth-context";
import { CanvasEditor } from "../../../components/canvas-editor";
import { fetchCanvas, ApiAuthError } from "../../../lib/server-api";

export default function CanvasPage() {
  const { canvasId } = useParams<{ canvasId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [canvasData, setCanvasData] = useState<{
    id: string;
    name: string;
    content: CanvasContent;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    // Get access token from session
    const token = (user as any)?.access_token;
    // Actually, need to get from auth context session
  }, [user, authLoading, router, canvasId]);

  // Implementation depends on how auth context exposes the session/accessToken
  // The existing pattern uses session.access_token from useAuth
}
```

Note: The exact implementation depends on how `useAuth` exposes the access token. Check `auth-context.tsx` for the pattern used in projects page.

- [ ] **Step 5: Update projects page to link to canvas**

In `apps/web/src/components/project-list.tsx`, make project cards link to `/canvas/{project.primaryCanvas.id}` instead of just showing the project name.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/
git commit -m "feat: add Excalidraw canvas editor with auto-save"
```

---

### Task 4: Frontend tests

**Files:**
- Create: `apps/web/test/canvas-editor.test.tsx`

- [ ] **Step 1: Write canvas page tests**

Test: renders loading state, redirects unauthenticated, renders Excalidraw after load.

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/
git commit -m "test: add canvas editor tests"
```

---

### Task 5: Full verification — typecheck, test, build

- [ ] **Step 1: Run full test suite**: `pnpm test`
- [ ] **Step 2: Run typecheck**: `pnpm typecheck`
- [ ] **Step 3: Run build**: `pnpm build`
- [ ] **Step 4: Fix any issues and commit**
