# Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add settings page with profile editing and agent model selection, backed by Supabase workspace_settings table.

**Architecture:** New Supabase migration + server endpoints + frontend settings page. Follows existing patterns for services, routes, and contracts.

**Tech Stack:** React 19, Next.js (static export), Tailwind v4, shadcn/ui, Supabase, Fastify, Zod.

---

### Task 1: Database migration and shared contracts

**Files:**
- Create: `supabase/migrations/20260323000005_workspace_settings.sql`
- Modify: `packages/shared/src/supabase/database.ts` — add workspace_settings types
- Modify: `packages/shared/src/contracts.ts` — add settings schemas
- Modify: `packages/shared/src/http.ts` — add settings HTTP schemas

**What to build:**

1. SQL migration for `workspace_settings` table:
   - `workspace_id` uuid PK references workspaces(id) ON DELETE CASCADE
   - `default_model` text NOT NULL DEFAULT 'gpt-5.4-mini'
   - `created_at` timestamptz DEFAULT now()
   - `updated_at` timestamptz DEFAULT now()
   - RLS: members can SELECT, owner/admin can INSERT/UPDATE
   - updated_at trigger

2. TypeScript database types in `database.ts`:
   - Add `workspace_settings` to Tables interface with Row, Insert, Update

3. Shared contracts:
   - `profileUpdateRequestSchema` — `{ displayName: z.string().min(1).max(100) }`
   - `workspaceSettingsSchema` — `{ defaultModel: z.string().min(1) }`
   - `modelInfoSchema` — `{ id: z.string(), name: z.string(), provider: z.string() }`

4. HTTP schemas:
   - `profileUpdateResponseSchema`
   - `workspaceSettingsResponseSchema`
   - `workspaceSettingsUpdateRequestSchema`
   - `modelListResponseSchema`

5. Build shared package after changes.

### Task 2: Server settings service and routes

**Files:**
- Create: `apps/server/src/features/settings/settings-service.ts`
- Create: `apps/server/src/http/settings.ts`
- Create: `apps/server/src/http/models.ts`
- Modify: `apps/server/src/http/viewer.ts` — add PATCH handler for profile
- Modify: `apps/server/src/app.ts` — register new routes
- Create: `apps/server/test/features/settings/settings-service.test.ts`
- Create: `apps/server/test/http/settings-routes.test.ts`

**What to build:**

1. Settings service (`settings-service.ts`):
   - `getWorkspaceSettings(accessToken, workspaceId)` — fetch or return defaults
   - `updateWorkspaceSettings(accessToken, workspaceId, settings)` — upsert
   - Uses `createUserClient` pattern from existing services

2. Settings routes (`settings.ts`):
   - `GET /api/workspace/settings` — get settings for user's workspace
   - `PUT /api/workspace/settings` — update settings
   - Auth guard using same pattern as viewer/projects routes
   - Need to resolve workspace from viewer first

3. Models route (`models.ts`):
   - `GET /api/models` — return available models list
   - Models derived from server config (hardcoded list of known models)
   - No auth required (public info)

4. Viewer route update:
   - Add `PATCH /api/viewer/profile` handler
   - Validates `displayName` via Zod
   - Updates profile via Supabase user client
   - Returns updated profile

5. App.ts:
   - Register settings routes
   - Register models route
   - Add PATCH to CORS methods

6. Tests:
   - Settings service: get defaults, get existing, update, upsert
   - Settings routes: auth guard, get, update, validation
   - Profile PATCH: success, validation error

### Task 3: Frontend settings page

**Files:**
- Create: `apps/web/src/app/settings/page.tsx`
- Create: `apps/web/src/components/settings-layout.tsx`
- Create: `apps/web/src/components/profile-section.tsx`
- Create: `apps/web/src/components/agent-section.tsx`
- Modify: `apps/web/src/lib/server-api.ts` — add settings API functions
- Modify: `apps/web/src/components/project-sidebar.tsx` — enable Settings nav link

**What to build:**

1. Server API functions in `server-api.ts`:
   - `updateProfile(accessToken, data)` — PATCH /api/viewer/profile
   - `fetchWorkspaceSettings(accessToken)` — GET /api/workspace/settings
   - `updateWorkspaceSettings(accessToken, data)` — PUT /api/workspace/settings
   - `fetchModels()` — GET /api/models

2. Settings page (`page.tsx`):
   - Auth guard (redirect to /login if not authenticated)
   - Loads profile and settings data on mount
   - Renders SettingsLayout with sections
   - Wrapped in Suspense for useSearchParams compatibility

3. Settings layout (`settings-layout.tsx`):
   - Left sidebar (200px) with section navigation
   - Back button linking to /projects
   - Active section state management
   - Content area rendering active section component

4. Profile section (`profile-section.tsx`):
   - Display name input (pre-filled)
   - Email display (read-only)
   - Save button with loading/success/error states
   - Calls updateProfile on submit

5. Agent section (`agent-section.tsx`):
   - Model select dropdown (fetches from /api/models)
   - Current selection pre-filled from workspace settings
   - Save button with loading/success/error states
   - Calls updateWorkspaceSettings on submit

6. Enable Settings nav in project-sidebar:
   - Remove opacity-50 and cursor-default from Settings item
   - Add router.push('/settings') onClick handler

### Task 4: Integrate model selection with agent runtime

**Files:**
- Modify: `apps/server/src/agent/deep-agent.ts` — accept model parameter
- Modify: `apps/server/src/http/runs.ts` — resolve workspace model before creating run
- Modify: `apps/server/src/app.ts` — pass settings service to run routes

**What to build:**

1. Modify agent factory to accept model override:
   - `createDeepAgent({ ..., model?: string })` — use override or fall back to env
   - Agent model string: `openai:${resolvedModel}`

2. Modify run creation to resolve model:
   - Before creating agent run, look up workspace settings for authenticated user
   - Get workspace ID from viewer data
   - Fetch `default_model` from workspace_settings
   - Pass to agent factory

3. This makes the model selection actually effective — users' choice flows through to the agent.

### Task 5: Full verification

- TypeScript typecheck across all packages
- All server tests pass
- All web tests pass
- Next.js build succeeds
- Manual verification: settings page accessible, profile save works, model selection works
