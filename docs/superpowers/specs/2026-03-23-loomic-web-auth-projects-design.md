# Loomic Web Auth & Projects UI Design

> **Status:** Approved. Covers Task 4 (web auth flow + project workspace UI) and Task 5 (E2E verification + documentation) from the Supabase Foundation V1 plan.

**Goal:** Add browser-side authentication (Magic Link + Google OAuth) and a protected project workspace UI to `apps/web`, completing the Supabase foundation user-facing surface.

**Architecture:** Static export (`output: "export"`) with client-side auth via Supabase Hash Fragment callback. All business data flows through `apps/server` — the web app never talks to Supabase Postgres directly. Each project maps to a deepagents instance; `projectId` is the agent context isolation key.

**Tech Stack:** `Tailwind CSS v4`, `shadcn/ui` (Radix primitives + Tailwind), `@supabase/supabase-js`, `next-themes`, `React Context`.

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
Already-authenticated users redirect to `/projects`.

### `/auth/callback` — Session Recovery

Pure client-side page. Reads Supabase token from `window.location.hash`, calls `supabase.auth.getSession()`, redirects to `/projects` on success or `/login` on failure. Shows a loading spinner only — no user interaction.

### `/projects` — Sidebar + List (Notion Layout)

**Sidebar (fixed, left):**
- Workspace avatar + name + type badge
- Navigation: Projects (active), Settings (placeholder)
- Recent projects shortcut list

**Main area (right):**
- Header: "Projects" title + "+ New Project" button
- Project list rows: icon, name, description snippet, last updated timestamp
- Empty state with CTA when no projects exist

**Create Project Dialog (shadcn Dialog):**
- Triggered by "+ New Project" button
- Fields: name (required, auto-trimmed), description (optional)
- Submits to `POST /api/projects` → refreshes list → auto-opens new project (future: navigate to canvas)

### `/` — Root Redirect

Client-side check: authenticated → `/projects`, unauthenticated → `/login`.

## Component Architecture

```
app/layout.tsx                    ← ThemeProvider + AuthProvider wrapper
├── app/page.tsx                  ← Root redirect logic
├── app/login/page.tsx            ← Split screen login
├── app/auth/callback/page.tsx    ← Hash fragment session recovery
└── app/projects/page.tsx         ← Protected project workspace

lib/supabase-browser.ts           ← Browser Supabase client singleton
lib/auth-context.tsx              ← AuthProvider + useAuth() hook
lib/server-api.ts                 ← Extended with viewer/projects API calls

components/
├── login-form.tsx                ← Magic Link + Google OAuth form
├── project-sidebar.tsx           ← Workspace sidebar navigation
├── project-list.tsx              ← Project list with empty state
├── create-project-dialog.tsx     ← Dialog for new project creation
└── ui/                           ← shadcn components (Button, Input, Dialog, etc.)
```

## Auth State Management

**React Context pattern:**

`AuthProvider` wraps the app in `layout.tsx`. It initializes Supabase client, subscribes to `onAuthStateChange`, and exposes state via `useAuth()` hook.

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

## Data Flow

```
Browser Supabase Auth
  → onAuthStateChange → AuthProvider updates React state
  → session.access_token injected into every server API request via Authorization header
  → apps/server validates token → creates user-scoped Supabase client → business logic
```

**API calls from web:**
- `GET /api/viewer` — bootstrap + fetch profile/workspace/membership (called once after login)
- `GET /api/projects` — list projects for current workspace
- `POST /api/projects` — create project with name + optional description

## Auth Callback Flow (Hash Fragment)

1. User clicks Magic Link in email or completes Google OAuth
2. Supabase Auth redirects to `{web_origin}/auth/callback#access_token=...&refresh_token=...`
3. `/auth/callback` page mounts → reads hash → `supabase.auth.getSession()` processes tokens
4. On success: `AuthProvider` receives `SIGNED_IN` event → redirect to `/projects`
5. On failure: redirect to `/login` with error indication

**Supabase Dashboard configuration required:**
- Auth > URL Configuration > Redirect URLs: `http://localhost:3000/auth/callback`
- Auth > Providers > Google: configure OAuth client ID/secret (if enabling Google)

## Styling

**Tailwind CSS setup:**
- Install Tailwind CSS v4 + `@tailwindcss/postcss` in `apps/web`
- Configure with project design tokens (neutral gray scale, single accent color)
- Remove existing CSS-in-JS from `layout.tsx` and `chat-workbench.tsx`

**shadcn/ui setup:**
- Initialize with `pnpx shadcn@latest init` in `apps/web`
- Install components: `button`, `input`, `dialog`, `label`, `separator`, `avatar`, `dropdown-menu`
- Theme: neutral base, radius small, light mode default

**Typography:**
- System sans-serif stack for UI (`Inter` or system default)
- One serif face for display headings (optional, like LOVART's FeatureDisplay approach)

## Testing Strategy

- **Unit tests:** `useAuth` hook behavior (mock Supabase client), login form renders correctly
- **Integration tests:** auth callback page processes hash fragment, project list fetches and renders, create dialog submits correctly
- **E2E verification (Task 5):** Real Supabase auth flow with test user, full create-and-list cycle against hosted project

## Scope Exclusions

- Canvas editor page (future milestone)
- Settings page implementation (sidebar shows placeholder link only)
- Multi-member workspace switching
- Desktop auth handoff
- Agent runtime integration within project (future — each project will spawn a deepagents instance)
