# Loomic Supabase Foundation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first Supabase-backed Loomic foundation so users can sign in with Magic Link or Google, bootstrap a personal workspace automatically, and access a protected project list plus project creation flow through the existing `apps/server` business boundary.

**Architecture:** Keep `apps/server` as the only business-data boundary, use `Supabase Auth` for browser-visible identity/session, and store workspace/project/canvas metadata in `Supabase Postgres` with workspace-membership-based RLS. Preserve the current `apps/web` static-export shape by implementing client-side auth callback recovery and protected pages without introducing a Next.js BFF.

**Tech Stack:** `TypeScript`, `Next.js App Router`, `Fastify`, `Supabase Auth`, `Supabase Postgres`, `Supabase Storage`, `@supabase/supabase-js`, `zod`, `vitest`, `pnpm`, `turbo`.

---

### Task 1: Define Supabase env contracts, dependencies, and shared HTTP schemas

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/package.json`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/package.json`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/config/env.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/env.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/http.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/index.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/supabase-env.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.env.example`

- [ ] **Step 1: Write the failing contract and env tests**

Add tests that assert:
- `loadServerEnv()` exposes explicit Supabase settings such as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PROJECT_ID`
- shared HTTP contracts exist for `GET /api/viewer`, `GET /api/projects`, and `POST /api/projects`
- project responses expose stable IDs, workspace ownership, and primary canvas metadata
- unauthenticated and authenticated error payloads have stable JSON shapes

- [ ] **Step 2: Run the targeted tests and confirm the Supabase surface is missing**

Run:
- `pnpm --filter @loomic/shared test -- contracts.test.ts`
- `pnpm --filter @loomic/server test -- supabase-env.test.ts`

Expected:
- FAIL because the shared project/viewer schemas and server env parsing do not exist yet.

- [ ] **Step 3: Add the minimal dependency and config surface**

Implement:
- `@supabase/supabase-js` in both `apps/web` and `apps/server`
- server env parsing for Supabase URL, anon key, service role key, and project ID
- web env parsing for browser-safe Supabase URL and anon key
- shared Zod schemas for:
  - `viewer` bootstrap response
  - `project` summary
  - `project list` response
  - `project create` request/response
  - stable auth/application error payloads
- `.env.example` documenting the non-secret and secret variables required for local development

- [ ] **Step 4: Re-run the env and shared tests**

Run:
- `pnpm --filter @loomic/shared test`
- `pnpm --filter @loomic/server test -- supabase-env.test.ts`

Expected:
- PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/package.json /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/package.json /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/config/env.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/env.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/http.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/index.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/supabase-env.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.env.example
git commit -m "chore: define loomic supabase env and contracts"
```

### Task 2: Create tracked Supabase schema, RLS, storage, and generated database types

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/supabase/config.toml`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/supabase/migrations/20260323_000001_loomic_supabase_foundation_v1.sql`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/supabase/database.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/index.ts`

- [ ] **Step 1: Write the migration and schema checklist before applying anything remotely**

Draft the SQL migration so it creates:
- `profiles`
- `workspaces`
- `workspace_members`
- `projects`
- `canvases`
- `asset_objects`
- helper functions/triggers for first-login bootstrap
- `project-assets` and `user-avatars` bucket setup
- workspace-membership-based RLS policies

Do not touch the remote project until the SQL reads cleanly as an idempotent, reviewable migration.

- [ ] **Step 2: Verify the repo has no Supabase project scaffolding yet**

Run:
- `find /Users/nowcoder/Desktop/auto-code-work/Loomic/supabase -maxdepth 3 -type f`
- `find /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/supabase -maxdepth 3 -type f`

Expected:
- both paths are absent before this task starts.

- [ ] **Step 3: Add tracked Supabase project assets**

Implement:
- `supabase/config.toml` with local project scaffolding conventions
- one reviewed migration SQL file that encodes the V1 schema, trigger/bootstrap logic, bucket creation, and RLS
- generated TypeScript database types in `packages/shared/src/supabase/database.ts`

The migration must target the already selected hosted project:
- project ref: `ndbwtngvypwgqexcirdo`

- [ ] **Step 4: Apply and verify the migration against the Supabase project**

Use Supabase MCP to:
- apply `20260323_000001_loomic_supabase_foundation_v1.sql` to `ndbwtngvypwgqexcirdo`
- list tables and confirm all six tables exist
- fetch security advisors and fix any critical policy omissions before proceeding
- generate fresh TypeScript types and write them into `packages/shared/src/supabase/database.ts`

Expected:
- the hosted project contains the new tables and buckets
- no critical security advisor remains for the new schema surface

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/supabase /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/supabase/database.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/index.ts
git commit -m "feat: add loomic supabase foundation schema"
```

### Task 3: Implement the server-side Supabase boundary for viewer bootstrap and project APIs

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/supabase/admin.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/supabase/user.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/bootstrap/ensure-user-foundation.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/projects/project-service.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/viewer.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/projects.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/app.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/viewer-routes.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/projects-routes.test.ts`

- [ ] **Step 1: Write the failing server API tests**

Cover:
- `GET /api/viewer` returns `401` without a bearer token
- `GET /api/viewer` with a valid Supabase user token bootstraps `profile`, personal `workspace`, and `workspace_member`
- `GET /api/projects` returns only the current member's projects
- `POST /api/projects` creates one project plus one primary canvas
- duplicate slug handling returns a stable application error instead of raw Supabase errors

- [ ] **Step 2: Run the new server tests and confirm the business boundary does not exist yet**

Run:
- `pnpm --filter @loomic/server test -- viewer-routes.test.ts`
- `pnpm --filter @loomic/server test -- projects-routes.test.ts`

Expected:
- FAIL because no authenticated viewer/project routes or Supabase boundary modules exist yet.

- [ ] **Step 3: Implement the server boundary**

Implement:
- an admin Supabase client for service-role writes
- a user-scoped Supabase client built from the incoming bearer token
- viewer bootstrap logic that is safe to call repeatedly
- project service methods for list/create under one workspace membership model
- route handlers:
  - `GET /api/viewer`
  - `GET /api/projects`
  - `POST /api/projects`

Rules:
- do not let `apps/web` talk directly to business tables
- do not leak raw provider errors to the client
- keep route registration flat in `src/http`, but keep non-trivial logic in focused feature modules

- [ ] **Step 4: Re-run the server test suite and smoke-check the API**

Run:
- `pnpm --filter @loomic/server test`
- `pnpm --filter @loomic/server typecheck`

Then run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
set -a; source .env.local; set +a; pnpm --filter @loomic/server dev
```

Expected:
- tests pass
- typecheck passes
- server starts with explicit Supabase env configured

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/supabase /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/bootstrap /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/features/projects /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/viewer.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/projects.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/app.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/viewer-routes.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/projects-routes.test.ts
git commit -m "feat: add loomic supabase project api"
```

### Task 4: Build the Web auth flow, callback recovery, and protected project workspace UI

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/supabase-browser.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/components/auth-screen.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/components/project-shell.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/login/page.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/auth/callback/page.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/projects/page.tsx`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/page.tsx`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/layout.tsx`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/server-api.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/test/auth-projects.test.tsx`

- [ ] **Step 1: Write the failing web tests**

Cover:
- unauthenticated users land on the login flow instead of the chat workbench
- login UI exposes Magic Link and Google entry points
- auth callback page restores session state for static-export-compatible browser flows
- authenticated users can fetch the protected project list through `apps/server`
- project creation updates the project list and opens the primary canvas placeholder route

- [ ] **Step 2: Run the web tests and confirm the auth/product shell is missing**

Run:
- `pnpm --filter @loomic/web test -- auth-projects.test.tsx`

Expected:
- FAIL because the login/callback/projects pages and authenticated server API client do not exist yet.

- [ ] **Step 3: Implement the browser auth and project UI**

Implement:
- one browser Supabase client module
- login UI with:
  - email Magic Link submit
  - Google OAuth launch
- one callback page that recovers auth state after Magic Link/OAuth redirects
- one Notion-like minimal project page that:
  - checks session
  - calls `GET /api/viewer`
  - calls `GET /api/projects`
  - submits `POST /api/projects`
- root page behavior that sends authenticated users to `/projects` and everyone else to `/login`

Rules:
- keep the style minimal, editorial, and creative-tool oriented
- do not reintroduce the old chat workbench as the default home page
- keep API calls centralized in `src/lib/server-api.ts`

- [ ] **Step 4: Re-run web tests and local browser verification**

Run:
- `pnpm --filter @loomic/web test`
- `pnpm --filter @loomic/web typecheck`

Then run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
pnpm --filter @loomic/web dev
```

Expected:
- tests pass
- typecheck passes
- `/login`, `/auth/callback`, and `/projects` load locally

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/supabase-browser.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/components/auth-screen.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/components/project-shell.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/login/page.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/auth/callback/page.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/projects/page.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/page.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/layout.tsx /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/server-api.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/test/auth-projects.test.tsx
git commit -m "feat: add loomic auth and project shell"
```

### Task 5: Verify the hosted Supabase integration end-to-end and record progress

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/docs/superpowers/progress/2026-03-23-loomic-supabase-foundation-status.md`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/docs/superpowers/specs/2026-03-23-loomic-supabase-foundation-design.md`

- [ ] **Step 1: Run end-to-end verification against the actual hosted project**

Verify all of the following with the real project `ndbwtngvypwgqexcirdo`:
- Magic Link sign-in
- Google OAuth sign-in
- first-login bootstrap
- project list retrieval
- project creation
- one primary canvas record creation
- RLS isolation between users

- [ ] **Step 2: Run the full repo quality gates**

Run:
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

Expected:
- PASS.

- [ ] **Step 3: Record the verified implementation status**

Document:
- exact env variables required locally
- which browser flows were verified
- which Supabase project/ref was used
- known limitations still deferred to later milestones:
  - full canvas editor migration
  - agent persistence
  - multi-member workspace UI
  - desktop auth handoff

- [ ] **Step 4: Reconcile the design doc with implementation reality**

Update the design document only where implementation decisions became concrete, such as:
- exact route paths
- exact table names
- exact callback approach used for static export compatibility

Do not broaden the milestone after implementation.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/docs/superpowers/progress/2026-03-23-loomic-supabase-foundation-status.md /Users/nowcoder/Desktop/auto-code-work/Loomic/docs/superpowers/specs/2026-03-23-loomic-supabase-foundation-design.md
git commit -m "docs: record loomic supabase foundation validation"
```
