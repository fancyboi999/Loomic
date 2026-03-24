# Loomic Supabase Foundation V1 Design

> **Status:** Proposed design target for the first Supabase-backed Loomic milestone. This document defines the boundary, schema direction, and integration strategy before implementation begins.

**Goal:** Introduce Supabase as Loomic's first durable business-data layer for authentication, user/workspace/project metadata, and future asset storage boundaries, while keeping the existing `apps/server` runtime boundary intact and deliberately excluding full canvas and agent persistence from this milestone.

**Architecture:** Loomic will use `Supabase Auth` for end-user identity, `Supabase Postgres` for the first durable business entities, and `Supabase Storage` for future asset storage boundaries. `apps/web` will use Supabase only for authentication/session awareness, while business data reads and writes continue to flow through `apps/server`. This preserves Loomic's current architecture, prevents business rules from scattering into the client, and leaves room to replace Supabase later without rewriting application-level behavior.

**Tech Stack:** `Supabase Auth`, `Supabase Postgres`, `Supabase Storage`, `Next.js App Router`, `Node.js`, `Fastify`, `TypeScript`, `Zod`, `RLS`.

---

## Scope

This milestone is intentionally narrow. It exists to establish a stable Supabase foundation, not to migrate the entire product surface in one pass.

Included:

- `Magic Link` authentication
- `Google OAuth` authentication
- user profile bootstrap
- personal workspace bootstrap
- project metadata persistence
- one primary canvas record per project
- protected project list page
- project creation flow
- service-side business access path through `apps/server`
- initial Storage bucket creation and metadata boundary

Explicitly excluded:

- full canvas editor migration
- agent run / conversation persistence
- collaborative editing
- team-management UI
- complete asset upload and processing flows
- direct Desktop integration changes

## Why This Is The First Supabase Step

Supabase is a good fit for Loomic's first durable business layer, but it should not be allowed to absorb the whole application architecture.

This milestone starts with auth and foundational metadata because:

- it creates visible product value quickly
- it forces the core auth/session/data boundary to become explicit
- it keeps later canvas and agent work grounded on stable ownership rules
- it avoids mixing high-change runtime code with first-time persistence work

This design deliberately does **not** start with agent persistence. The current Loomic Phase A server runtime should stay focused on proving the runtime and tool boundary first.

## System Boundary

The system boundary is the most important design decision in this phase:

- `Supabase Auth`
  - owns end-user login and session primitives
- `Supabase Postgres`
  - owns durable business entities for user, workspace, project, and canvas metadata
- `Supabase Storage`
  - owns binary object storage boundaries and signed access patterns
- `apps/server`
  - remains the business boundary for project/canvas/application data access
- `apps/web`
  - uses Supabase for auth/session only, not as the primary business-data boundary
- `apps/desktop`
  - remains untouched in this milestone

The rule is simple:

- authentication may be client-aware
- business data is still application-owned
- Supabase is infrastructure, not the product architecture itself

## Lock-In Strategy

Using Supabase does not automatically create unacceptable lock-in. Lock-in happens when product semantics are encoded directly into provider-specific client calls across the app.

To reduce future migration cost:

- business code should depend on Loomic-owned repository/service interfaces
- `apps/server` should translate application operations into Supabase operations
- client code should not become the source of truth for project/canvas reads and writes
- storage object keys should follow Loomic business semantics, not Supabase SDK convenience semantics
- auth identities should be mapped into Loomic's own user/workspace semantics

This means Supabase is the first storage/auth implementation, not the final architectural truth.

## Product Model

### Auth Model

The first supported auth methods are:

- email `Magic Link`
- `Google OAuth`

The system identity root is `auth.users.id`.

The app-level rules are:

- first login creates a `profile`
- first login creates a personal `workspace`
- first login creates a `workspace_membership` row for the user
- later features may add team workspaces without changing the base ownership model

### Ownership Model

Although the first product UX is personal-space-first, the schema should be compatible with future team spaces.

This means:

- the first visible user experience behaves like `user -> projects`
- the database model is `workspace -> projects`
- a personal workspace is just a workspace with `type = personal`
- future team spaces become a second workspace type, not a schema rewrite

## Proposed Data Model

### `profiles`

Purpose:

- store Loomic user profile metadata associated with `auth.users`

Suggested fields:

- `id` = `auth.users.id`
- `email`
- `display_name`
- `avatar_url`
- `created_at`
- `updated_at`

### `workspaces`

Purpose:

- represent both personal and future team containers

Suggested fields:

- `id`
- `type` with values like `personal` or `team`
- `name`
- `owner_user_id`
- `created_at`
- `updated_at`

### `workspace_members`

Purpose:

- unify access semantics for both personal and future team spaces

Suggested fields:

- `workspace_id`
- `user_id`
- `role`
- `created_at`

For personal workspaces, the first member is the owner.

### `projects`

Purpose:

- represent durable Loomic work units under a workspace

Suggested fields:

- `id`
- `workspace_id`
- `name`
- `slug`
- `description`
- `created_by`
- `archived_at`
- `created_at`
- `updated_at`

### `canvases`

Purpose:

- represent canvas metadata under a project

Suggested fields:

- `id`
- `project_id`
- `name`
- `is_primary`
- `created_by`
- `created_at`
- `updated_at`

Product behavior for V1:

- each project uses one primary canvas

Schema behavior for V1:

- the table allows multiple canvases later

### `asset_objects`

Purpose:

- store storage metadata for future file and generated asset handling

Suggested fields:

- `id`
- `workspace_id`
- `project_id`
- `bucket`
- `object_path`
- `mime_type`
- `byte_size`
- `created_by`
- `created_at`

V1 does not require the full upload pipeline, but the metadata boundary should exist now.

## Storage Design

Initial Storage buckets:

- `project-assets`
- `user-avatars`

First milestone rule:

- create buckets and policy boundaries now
- do not force a full asset upload UX into this milestone

This keeps Storage ready for the upcoming canvas and generated-media phases without pulling this milestone off scope.

## RLS Model

The first RLS model should be workspace-membership-based.

The guiding rule:

- a user can access a workspace if they are a member of it
- project, canvas, and asset access inherits from workspace access

This avoids inventing separate permission systems for each table and keeps future team support straightforward.

At a high level:

- `profiles` are user-owned
- `workspaces` are visible to members
- `projects` are visible to workspace members
- `canvases` are visible to workspace members through project ownership
- `asset_objects` are visible to workspace members

## Application Flow

The V1 user journey is:

1. Unauthenticated user visits the Web app.
2. The app redirects them to a login page.
3. The user authenticates with `Magic Link` or `Google`.
4. On first successful login, Loomic initializes:
   - `profile`
   - personal `workspace`
   - membership
5. The user lands on a protected project list page.
6. The user can create a project.
7. Project creation also creates one primary canvas row.
8. The user enters a placeholder primary-canvas page.

The placeholder page exists only to prove the durable project/canvas path is real before the actual canvas editor is migrated.

## Integration Strategy

### `apps/web`

Responsibilities:

- login screen
- logout
- session-aware routing
- protected project list
- project creation UI

Rules:

- may use Supabase client for auth/session
- should not become the primary business-data integration surface

### `apps/server`

Responsibilities:

- service-side Supabase client setup
- project and canvas business operations
- stable request/response boundaries
- provider abstraction for future persistence changes

Rules:

- project and canvas data access should flow here
- server remains the business boundary

### `packages/shared`

Responsibilities:

- shared request/response schemas for the new project-list and project-create flows
- stable error payloads where app boundaries are crossed

## Error Handling

Required error paths:

- auth failure
- profile/workspace bootstrap failure
- protected-route session invalidation
- project query failure
- project creation failure

Rules:

- UI should show user-facing errors, not raw provider errors
- server should normalize provider/database failures into Loomic-stable error shapes
- first-login bootstrap failures should be observable and recoverable, not silently swallowed

## Validation

This milestone is complete only when all of the following are true:

- user can sign in with `Magic Link`
- user can sign in with `Google`
- first login bootstraps `profile`, personal `workspace`, and membership
- unauthenticated users cannot access protected project pages
- authenticated users can view their project list
- authenticated users can create a project
- project creation also creates one primary canvas record
- the project detail route can resolve that primary canvas placeholder page
- RLS correctly prevents cross-workspace project access

## Risks

- letting `apps/web` talk directly to business tables would create long-term boundary drift
- skipping `workspace` as a first-class model would force later schema rewrites for teams
- over-committing Storage now would unnecessarily expand scope
- mixing agent persistence into this milestone would blur responsibilities and slow delivery

## Design Summary

The first Supabase milestone for Loomic should establish durable auth and business ownership, not attempt to finish the whole product migration.

The recommended outcome is:

- `Magic Link + Google`
- personal-first UX with team-compatible schema
- workspace-based RLS
- durable `profile/workspace/project/canvas` metadata
- Storage buckets prepared but not overused
- business-data access still centered in `apps/server`

This gives Loomic a credible persistence and auth foundation while keeping the current runtime architecture coherent and extensible.
