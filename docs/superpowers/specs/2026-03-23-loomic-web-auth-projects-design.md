# Loomic Web Auth & Projects UI Design

> **Status:** Approved. Covers Task 4 (web auth flow + project workspace UI) and Task 5 (E2E verification + documentation) from the Supabase Foundation V1 plan.

**Goal:** Add browser-side authentication (Magic Link + Google OAuth) and a protected project workspace UI to `apps/web`, completing the Supabase foundation user-facing surface.

**Architecture:** Static export (`output: "export"`) with client-side auth via Supabase Hash Fragment callback. All business data flows through `apps/server` — the web app never talks to Supabase Postgres directly. Each project maps to a deepagents instance; `projectId` is the agent context isolation key.

**Tech Stack:** `Tailwind CSS v4`, `shadcn/ui` (Radix primitives + Tailwind), `@supabase/supabase-js`, `next-themes`, `React Context`.

**Deployment note:** The existing `next.config.ts` sets `assetPrefix: "./"` for relative asset paths. This breaks client-side routing on sub-path pages (`/auth/callback`, `/projects`) because JS chunks resolve relative to the current directory. **Fix:** Remove `assetPrefix` from `next.config.ts` for this task. Local dev and Vercel/static hosting work with default absolute paths. If a CDN prefix is needed later, set it to an absolute URL.

---

## Design Style

- **Notion-inspired** — minimal, content-first, editorial feel
- **LOVART design elements** — serif/sans-serif typographic duality, dark brand panel on login
- **Black/white primary palette** — neutral/gray tones, restrained accent usage
- Light mode default, dark mode supported via toggle

## Pages

### `/login` — Split Screen

Left panel (black): Loomic logo, tagline, 3 product value points.
Right panel (white): email input → "Send Magic Link" button, divider, "Continue with Google" button.
Already-authenticated users redirect to `/projects` (after `loading === false` check).

### `/auth/callback` — Session Recovery

Pure client-side page. Shows a centered loading spinner — no user interaction.

**Mechanism:** `@supabase/supabase-js` v2 automatically detects and processes hash fragment tokens when the client is created via `createClient()`. The callback page does NOT manually parse the hash. Instead:

1. Page mounts → Supabase browser client initializes (auto-processes `#access_token=...` from URL)
2. `onAuthStateChange` fires with `SIGNED_IN` event
3. `AuthProvider` updates state → callback page detects `user !== null` → redirects to `/projects`
4. If no session after a timeout (default 5s — generous for slow networks; bad tokens fail immediately via `onAuthStateChange` error event, so the timeout only covers edge cases like network stalls) → redirect to `/login` with error indication

### `/projects` — Sidebar + List (Notion Layout)

**Sidebar (fixed, left):**
- Workspace avatar (initials fallback when `avatarUrl` is null) + name + type badge ("Personal" / "Team")
- Navigation: Projects (active), Settings (placeholder link, not implemented)
- Recent projects shortcut list (first 5 from project list)

**Main area (right):**
- Header: "Projects" title + "+ New Project" button
- Project list rows: icon, name, description snippet, relative time ("2h ago", "3d ago")
- Empty state with illustration and CTA when no projects exist

**Data loading:**
1. On mount, call `GET /api/viewer` (with access token) to bootstrap and fetch workspace context
2. Then call `GET /api/projects` to fetch project list
3. Error handling:
   - `GET /api/viewer` returns `401` → token expired mid-session → call `signOut()` → redirect to `/login`
   - `GET /api/viewer` returns `bootstrap_failed` (500) → show error banner with retry button — do NOT redirect to login (the user is authenticated, the server is having issues)
4. If `GET /api/projects` returns `401` → same as above: `signOut()` → `/login`
5. If `GET /api/projects` fails with non-401 error, show an error state with retry

**Create Project Dialog (shadcn Dialog):**
- Triggered by "+ New Project" button
- Fields: name (required, auto-trimmed), description (optional)
- Submits to `POST /api/projects` — success is HTTP **201 Created** (not 200)
- **Error handling:**
  - `409` with `project_slug_taken` → show inline error: "A project with this name already exists. Try a different name."
  - `500` with `project_create_failed` → show inline error: "Failed to create project. Please try again."
- On success: close dialog, refresh project list, highlight new project row

### `/` — Root Redirect

Client-side check with loading guard:
- While `loading === true` → render blank page (or minimal spinner)
- When `loading === false` and `user !== null` → redirect to `/projects`
- When `loading === false` and `user === null` → redirect to `/login`

## Component Architecture

```
app/layout.tsx                    ← html suppressHydrationWarning + ThemeProvider + AuthProvider
├── app/page.tsx                  ← Root redirect with loading guard
├── app/login/page.tsx            ← Split screen login
├── app/auth/callback/page.tsx    ← Auto-processed hash fragment recovery
└── app/projects/page.tsx         ← Protected project workspace

lib/supabase-browser.ts           ← Lazy-initialized browser Supabase client (getSupabaseBrowserClient())
lib/auth-context.tsx              ← AuthProvider + useAuth() hook
lib/server-api.ts                 ← Extended: each function takes accessToken parameter

components/
├── login-form.tsx                ← Magic Link + Google OAuth form
├── project-sidebar.tsx           ← Workspace sidebar navigation
├── project-list.tsx              ← Project list with empty state
├── create-project-dialog.tsx     ← Dialog for new project creation
└── ui/                           ← shadcn components (Button, Input, Dialog, etc.)
```

**Note on `@loomic/ui`:** The existing `@loomic/ui` workspace package remains as-is (currently a type-check-only placeholder). shadcn components are initialized inside `apps/web/src/components/ui/` because they are web-specific (Tailwind + React). If shared UI components are needed across apps in the future, they move to `@loomic/ui` at that point.

## Auth State Management

**React Context pattern:**

`AuthProvider` wraps the app in `layout.tsx`. It creates the Supabase browser client (lazy), subscribes to `onAuthStateChange`, and exposes state via `useAuth()` hook.

```typescript
// lib/auth-context.tsx
interface AuthContext {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
```

Protected pages check `useAuth()` — if `loading` is false and `user` is null, redirect to `/login`.

## Server API Client Pattern

**Each API function takes `accessToken: string` as a parameter.** This keeps `server-api.ts` as a pure module with no global state, testable without React context.

```typescript
// lib/server-api.ts — extended interface
export function fetchViewer(accessToken: string): Promise<ViewerResponse>;
export function fetchProjects(accessToken: string): Promise<ProjectListResponse>;
export function createProject(accessToken: string, data: ProjectCreateRequest): Promise<ProjectCreateResponse>;
```

All functions set `Authorization: Bearer ${accessToken}` header. The access token is obtained from `useAuth().session.access_token` in calling components.

Response status handling:
- `200` → success (GET endpoints)
- `201` → success (POST /api/projects)
- `401` → call `signOut()` (token expired/invalid)
- `409` → `project_slug_taken` (bubble up to UI for inline error)
- `500` → application error (show error state with retry)

## Data Flow

```
Browser Supabase Auth
  → onAuthStateChange → AuthProvider updates React state (user, session)
  → Components call useAuth() to get session.access_token
  → Pass accessToken to server-api.ts functions
  → apps/server validates token → user-scoped Supabase client → business logic → JSON response
```

## Auth Callback Flow (Hash Fragment)

1. User clicks Magic Link in email or completes Google OAuth
2. Supabase Auth redirects to `{web_origin}/auth/callback#access_token=...&refresh_token=...`
3. `/auth/callback` page mounts → `getSupabaseBrowserClient()` creates client → library auto-detects hash fragment and processes tokens internally
4. `onAuthStateChange` fires `SIGNED_IN` → `AuthProvider` sets `user` + `session`
5. Callback page detects `user !== null` → `router.push('/projects')`
6. Timeout (5s): if still no session → redirect to `/login`

**Supabase Dashboard configuration required:**
- Auth > URL Configuration > Redirect URLs: `http://localhost:3000/auth/callback`
- Auth > Providers > Google: configure OAuth client ID/secret (if enabling Google)

## Styling

**Tailwind CSS setup:**
- Install `tailwindcss` v4 + `@tailwindcss/postcss` in `apps/web`
- Add `postcss.config.mjs` with `@tailwindcss/postcss` plugin
- Add `app/globals.css` with `@import "tailwindcss"` and design tokens

**Migration from existing CSS-in-JS:**
- **Drop:** radial gradient background, serif font family, all inline `<style>` blocks in `layout.tsx`
- **Preserve via Tailwind:** `box-sizing: border-box` (Tailwind preflight handles this), `body { margin: 0 }` (preflight handles this), responsive viewport behavior
- **Migrate `chat-workbench.tsx`:** Convert all inline styles to Tailwind utility classes. The existing chat workbench component remains functional but restyled.

**shadcn/ui setup:**
- Initialize with `pnpx shadcn@latest init` in `apps/web`
- Components go to `src/components/ui/` (web-specific, not shared via `@loomic/ui`)
- Install components: `button`, `input`, `dialog`, `label`, `separator`, `avatar`, `dropdown-menu`
- Theme: neutral base, radius small, light mode default

**next-themes setup:**
- `ThemeProvider` wraps children in `layout.tsx` with `attribute="class"` and `defaultTheme="light"`
- `<html>` element must have `suppressHydrationWarning={true}` to prevent React hydration mismatch in static export

**Typography:**
- UI body: system sans-serif stack (`Inter`, `-apple-system`, `system-ui`)
- Display headings on login: one serif face (optional accent)

## Testing Strategy

- **Unit tests:** `useAuth` hook behavior (mock Supabase client), login form renders, server-api functions with mocked fetch
- **Integration tests:** project list fetches and renders, create dialog submits and handles 201/409/500, root redirect respects loading state
- **E2E verification (Task 5):** Real Supabase auth flow with test user, full create-and-list cycle against hosted project `ndbwtngvypwgqexcirdo`

## Scope Exclusions

- Canvas editor page (future milestone)
- Settings page implementation (sidebar shows placeholder link only)
- Multi-member workspace switching
- Desktop auth handoff
- Agent runtime integration within project (future — each project will spawn a deepagents instance)
