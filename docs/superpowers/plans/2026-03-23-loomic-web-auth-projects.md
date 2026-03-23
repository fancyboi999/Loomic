# Loomic Web Auth & Projects UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-side authentication (Magic Link + Google OAuth), protected project workspace, and Notion-style UI to `apps/web`.

**Architecture:** Static export Next.js app with Tailwind CSS + shadcn/ui. Auth via Supabase Hash Fragment callback. Business data through `apps/server`. React Context for auth state. Each API function takes `accessToken` parameter.

**Tech Stack:** `Tailwind CSS v4`, `shadcn/ui`, `@supabase/supabase-js`, `next-themes`, `React Context`, `vitest`, `@testing-library/react`.

**Design Spec:** `docs/superpowers/specs/2026-03-23-loomic-web-auth-projects-design.md`

---

### Task 1: Install Tailwind CSS v4 + shadcn/ui and migrate existing styles

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts` (remove `assetPrefix`)
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/layout.tsx` (remove CSS-in-JS, add globals.css import, add suppressHydrationWarning)
- Create: `apps/web/src/components/ui/` (shadcn output directory)
- Create: `apps/web/components.json` (shadcn config)

- [ ] **Step 1: Install Tailwind CSS v4 and PostCSS**

Run:
```bash
cd apps/web
pnpm add -D tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: Install next-themes for dark mode support**

Run:
```bash
cd apps/web
pnpm add next-themes
```

- [ ] **Step 3: Create PostCSS config**

Create `apps/web/postcss.config.mjs`:
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 4: Create globals.css with Tailwind import and design tokens**

Create `apps/web/src/app/globals.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 5: Remove assetPrefix from next.config.ts**

Modify `apps/web/next.config.ts` — remove `assetPrefix: "./"`, keep only `output: "export"`:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
```

- [ ] **Step 6: Initialize shadcn/ui**

Run from `apps/web`:
```bash
pnpx shadcn@latest init --style new-york --base-color neutral --css-variables
```

This creates `components.json` and `src/components/ui/` structure. After init, review `components.json` to ensure `aliases.components` points to `@/components` and `aliases.ui` points to `@/components/ui`.

**Important:** The shadcn init will modify `globals.css` and `tsconfig.json`. Review changes — ensure the Tailwind import stays and path aliases are compatible with the existing Next.js setup.

- [ ] **Step 7: Install shadcn components**

Run from `apps/web`:
```bash
pnpx shadcn@latest add button input dialog label separator avatar dropdown-menu
```

- [ ] **Step 8: Rewrite layout.tsx — remove CSS-in-JS, add Tailwind + providers**

Replace `apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import "./globals.css";

export const metadata: Metadata = {
  title: "Loomic",
  description: "AI creative workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Verify build and existing tests still pass**

Run:
```bash
pnpm --filter @loomic/web build
pnpm --filter @loomic/web test
```

Expected: Build succeeds. Tests may need minor adjustments if the ChatWorkbench CSS-in-JS removal breaks snapshots — fix any failures.

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts apps/web/postcss.config.mjs apps/web/components.json apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/components/ui/ apps/web/src/lib/utils.ts
git commit -m "chore: add tailwind v4, shadcn/ui, and next-themes to web app"
```

**Note:** `src/lib/utils.ts` is created by shadcn init (contains `cn()` helper). Also add any other files shadcn init/add created — check with `git status` before staging.

---

### Task 2: Create Supabase browser client and AuthProvider context

**Files:**
- Create: `apps/web/src/lib/supabase-browser.ts`
- Create: `apps/web/src/lib/auth-context.tsx`
- Create: `apps/web/src/components/providers.tsx`
- Create: `apps/web/test/auth-context.test.tsx`
- Modify: `apps/web/src/app/layout.tsx` (wrap with Providers)

- [ ] **Step 1: Write the failing auth context test**

Create `apps/web/test/auth-context.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock supabase-browser before importing auth-context
vi.mock("../src/lib/supabase-browser", () => {
  const mockOnAuthStateChange = vi.fn();
  const mockGetSession = vi.fn();
  const mockSignOut = vi.fn();
  return {
    getSupabaseBrowserClient: vi.fn(() => ({
      auth: {
        onAuthStateChange: mockOnAuthStateChange,
        getSession: mockGetSession,
        signOut: mockSignOut,
      },
    })),
    __mockOnAuthStateChange: mockOnAuthStateChange,
    __mockGetSession: mockGetSession,
    __mockSignOut: mockSignOut,
  };
});

import { AuthProvider, useAuth } from "../src/lib/auth-context";
import {
  __mockOnAuthStateChange,
  __mockGetSession,
} from "../src/lib/supabase-browser";

function TestConsumer() {
  const { user, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("starts in loading state then resolves to no user", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("none");
  });

  it("exposes user when session exists", async () => {
    const mockSession = {
      access_token: "token_123",
      user: { id: "user_1", email: "test@test.com" },
    };
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("test@test.com");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/web test -- auth-context`

Expected: FAIL — modules not found.

- [ ] **Step 3: Create Supabase browser client**

Create `apps/web/src/lib/supabase-browser.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@loomic/shared";

let client: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  client = createClient<Database>(url, anonKey, {
    auth: {
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });

  return client;
}
```

- [ ] **Step 4: Create AuthProvider and useAuth hook**

Create `apps/web/src/lib/auth-context.tsx`:
```tsx
"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getSupabaseBrowserClient } from "./supabase-browser";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
```

- [ ] **Step 5: Add AuthProvider to layout.tsx**

Wrap `ThemeProvider` children with `AuthProvider` in `apps/web/src/app/layout.tsx`. Since `AuthProvider` is a client component, wrap both providers in a client-side `Providers` component:

Create `apps/web/src/components/providers.tsx`:
```tsx
"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { AuthProvider } from "../lib/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
```

Update `apps/web/src/app/layout.tsx` to use `<Providers>` instead of inline `<ThemeProvider>`.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @loomic/web test`

Expected: PASS — both auth-context tests and existing tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/supabase-browser.ts apps/web/src/lib/auth-context.tsx apps/web/src/components/providers.tsx apps/web/src/app/layout.tsx apps/web/test/auth-context.test.tsx
git commit -m "feat: add supabase browser client and auth context provider"
```

---

### Task 3: Extend server-api.ts with authenticated viewer and project API calls

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`
- Create: `apps/web/test/server-api.test.ts`

- [ ] **Step 1: Write failing server-api tests**

Create `apps/web/test/server-api.test.ts`:
```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  fetchViewer,
  fetchProjects,
  createProject,
} from "../src/lib/server-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("authenticated server API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SERVER_BASE_URL", "http://localhost:3001");
  });

  it("fetchViewer sends bearer token and returns viewer response", async () => {
    const viewer = {
      profile: { id: "u1", email: "a@b.com", displayName: "A", avatarUrl: null },
      workspace: { id: "w1", name: "W", type: "personal", ownerUserId: "u1" },
      membership: { workspaceId: "w1", userId: "u1", role: "owner" },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => viewer });

    const result = await fetchViewer("token_abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/viewer",
      expect.objectContaining({
        headers: { Authorization: "Bearer token_abc" },
      }),
    );
    expect(result.profile.id).toBe("u1");
  });

  it("createProject sends POST with bearer token and handles 201", async () => {
    const project = {
      project: {
        id: "p1", name: "Test", slug: "test", description: null,
        workspace: { id: "w1", name: "W", type: "personal", ownerUserId: "u1" },
        primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
        createdAt: "2026-03-23T00:00:00Z", updatedAt: "2026-03-23T00:00:00Z",
      },
    };
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => project });

    const result = await createProject("token_abc", { name: "Test" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token_abc",
          "content-type": "application/json",
        }),
      }),
    );
    expect(result.project.id).toBe("p1");
  });

  it("fetchProjects sends bearer token and returns list", async () => {
    const list = { projects: [{ id: "p1", name: "Test", slug: "test" }] };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => list });

    const result = await fetchProjects("token_abc");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/projects",
      expect.objectContaining({
        headers: { Authorization: "Bearer token_abc" },
      }),
    );
    expect(result.projects).toHaveLength(1);
  });

  it("createProject throws ApiApplicationError with code on 409", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: "project_slug_taken", message: "Slug taken." },
      }),
    });

    await expect(createProject("token_abc", { name: "Dup" })).rejects.toThrow(
      "Slug taken.",
    );
    try {
      await createProject("token_abc", { name: "Dup" });
    } catch (err) {
      expect((err as any).code).toBe("project_slug_taken");
    }
  });

  it("fetchViewer throws ApiAuthError on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchViewer("expired")).rejects.toThrow("unauthorized");
  });

  it("fetchProjects throws ApiAuthError on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "unauthorized", message: "Bad token." },
      }),
    });

    await expect(fetchProjects("expired")).rejects.toThrow("unauthorized");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/web test -- server-api`

Expected: FAIL — `fetchViewer`, `fetchProjects`, `createProject` not exported.

- [ ] **Step 3: Implement authenticated API functions**

Modify `apps/web/src/lib/server-api.ts` — add the three new functions alongside the existing `createRun`. Define typed error classes `ApiAuthError` and `ApiApplicationError`:

```typescript
import type {
  RunCreateRequest,
  RunCreateResponse,
  ViewerResponse,
  ProjectListResponse,
  ProjectCreateRequest,
  ProjectCreateResponse,
} from "@loomic/shared";

import { getServerBaseUrl } from "./env";

// --- Error types ---

export class ApiAuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export class ApiApplicationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiApplicationError";
    this.code = code;
  }
}

// --- Existing ---

export async function createRun(payload: RunCreateRequest) {
  const response = await fetch(`${getServerBaseUrl()}/api/agent/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Run creation failed with status ${response.status}`);
  }

  return (await response.json()) as RunCreateResponse;
}

// --- Authenticated API ---

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) {
    throw new ApiAuthError();
  }
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

export async function fetchViewer(
  accessToken: string,
): Promise<ViewerResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/viewer`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ViewerResponse;
}

export async function fetchProjects(
  accessToken: string,
): Promise<ProjectListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectListResponse;
}

export async function createProject(
  accessToken: string,
  data: ProjectCreateRequest,
): Promise<ProjectCreateResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/projects`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(data),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as ProjectCreateResponse;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @loomic/web test`

Expected: ALL PASS — new server-api tests + existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server-api.ts apps/web/test/server-api.test.ts
git commit -m "feat: add authenticated viewer and project API client functions"
```

---

### Task 4: Build the login page with split screen layout

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/components/login-form.tsx`
- Create: `apps/web/test/login.test.tsx`

- [ ] **Step 1: Write the failing login test**

Create `apps/web/test/login.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

import LoginPage from "../src/app/login/page";
import { AuthProvider } from "../src/lib/auth-context";

function renderLogin() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

describe("Login page", () => {
  it("renders split screen with brand panel and login form", () => {
    renderLogin();
    expect(screen.getByText("Loomic")).toBeInTheDocument();
    expect(screen.getByText(/Send Magic Link/i)).toBeInTheDocument();
    expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument();
  });

  it("renders email input field", () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/web test -- login`

Expected: FAIL — login page not found.

- [ ] **Step 3: Create LoginForm component**

Create `apps/web/src/components/login-form.tsx`:
```tsx
"use client";

import { useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogle() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (authError) {
      setError(authError.message);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a magic link to <strong>{email}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Sign in to your workspace
        </p>
      </div>

      <form onSubmit={handleMagicLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send Magic Link"}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive text-center" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground uppercase">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleGoogle}
        type="button"
      >
        Continue with Google
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create login page**

Create `apps/web/src/app/login/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { LoginForm } from "../../components/login-form";
import { useAuth } from "../../lib/auth-context";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/projects");
    }
  }, [user, loading, router]);

  if (loading || user) return null;

  return (
    <div className="flex min-h-screen">
      {/* Left panel — dark brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-center px-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Loomic</h1>
        <p className="text-lg text-neutral-400 mb-10">
          AI-powered creative workspace
        </p>
        <ul className="space-y-4 text-sm text-neutral-300">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            Design and iterate with intelligent agents
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            Organize projects in a unified workspace
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 block h-1.5 w-1.5 rounded-full bg-white shrink-0" />
            From concept to production, end to end
          </li>
        </ul>
      </div>

      {/* Right panel — login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-6 py-12">
        <LoginForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @loomic/web test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/login/ apps/web/src/components/login-form.tsx apps/web/test/login.test.tsx
git commit -m "feat: add split screen login page with magic link and google oauth"
```

---

### Task 5: Build the auth callback page

**Files:**
- Create: `apps/web/src/app/auth/callback/page.tsx`
- Create: `apps/web/test/auth-callback.test.tsx`

- [ ] **Step 1: Write the failing callback test**

Create `apps/web/test/auth-callback.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
}));

vi.mock("../src/lib/supabase-browser", () => {
  const mockOnAuthStateChange = vi.fn();
  const mockGetSession = vi.fn();
  return {
    getSupabaseBrowserClient: vi.fn(() => ({
      auth: {
        onAuthStateChange: mockOnAuthStateChange,
        getSession: mockGetSession,
        signOut: vi.fn(),
      },
    })),
    __mockOnAuthStateChange: mockOnAuthStateChange,
    __mockGetSession: mockGetSession,
  };
});

import CallbackPage from "../src/app/auth/callback/page";
import { AuthProvider } from "../src/lib/auth-context";
import { __mockOnAuthStateChange, __mockGetSession } from "../src/lib/supabase-browser";

describe("Auth callback page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /projects when session is resolved", async () => {
    const session = {
      access_token: "tok",
      user: { id: "u1", email: "a@b.com" },
    };
    (__mockGetSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session },
      error: null,
    });
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <AuthProvider>
        <CallbackPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/projects");
    });
  });

  it("shows a loading spinner while processing", () => {
    (__mockGetSession as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}), // never resolves
    );
    (__mockOnAuthStateChange as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    render(
      <AuthProvider>
        <CallbackPage />
      </AuthProvider>,
    );

    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/web test -- auth-callback`

Expected: FAIL — callback page not found.

- [ ] **Step 3: Create callback page**

Create `apps/web/src/app/auth/callback/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuth } from "../../../lib/auth-context";

export default function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const timedOut = useRef(false);

  // Redirect once session is resolved
  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/projects");
    } else if (timedOut.current) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Timeout: if no session after 5s, redirect to login
  useEffect(() => {
    const timer = setTimeout(() => {
      timedOut.current = true;
      // Force a re-check — if still no user, the effect above redirects
      router.replace("/login");
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <div className="h-6 w-6 mx-auto animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @loomic/web test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/auth/ apps/web/test/auth-callback.test.tsx
git commit -m "feat: add auth callback page for session recovery"
```

---

### Task 6: Build the projects page with sidebar, list, and create dialog

**Files:**
- Create: `apps/web/src/app/projects/page.tsx`
- Create: `apps/web/src/components/project-sidebar.tsx`
- Create: `apps/web/src/components/project-list.tsx`
- Create: `apps/web/src/components/create-project-dialog.tsx`
- Create: `apps/web/test/projects.test.tsx`

- [ ] **Step 1: Write the failing projects page test**

Create `apps/web/test/projects.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, replace: mockReplace })),
}));

const mockSignOut = vi.fn();
vi.mock("../src/lib/auth-context", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "u1", email: "test@test.com" },
    session: { access_token: "token_123" },
    loading: false,
    signOut: mockSignOut,
  })),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import ProjectsPage from "../src/app/projects/page";

const viewerResponse = {
  profile: { id: "u1", email: "test@test.com", displayName: "Test", avatarUrl: null },
  workspace: { id: "w1", name: "My Workspace", type: "personal", ownerUserId: "u1" },
  membership: { workspaceId: "w1", userId: "u1", role: "owner" },
};

const workspace = { id: "w1", name: "My Workspace", type: "personal", ownerUserId: "u1" };

const projectsResponse = {
  projects: [
    {
      id: "p1", name: "Brand System", slug: "brand-system",
      description: "Primary brand project",
      workspace, primaryCanvas: { id: "c1", name: "Main Canvas", isPrimary: true },
      createdAt: "2026-03-23T00:00:00Z", updatedAt: "2026-03-23T10:00:00Z",
    },
    {
      id: "p2", name: "App Redesign", slug: "app-redesign",
      description: null,
      workspace, primaryCanvas: { id: "c2", name: "Main Canvas", isPrimary: true },
      createdAt: "2026-03-22T00:00:00Z", updatedAt: "2026-03-22T00:00:00Z",
    },
  ],
};

describe("Projects page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SERVER_BASE_URL", "http://localhost:3001");
  });

  function mockSuccessfulLoad() {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => viewerResponse })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => projectsResponse });
  }

  it("renders sidebar with workspace name and project list", async () => {
    mockSuccessfulLoad();
    render(<ProjectsPage />);

    expect(await screen.findByText("My Workspace")).toBeInTheDocument();
    expect(await screen.findByText("Brand System")).toBeInTheDocument();
    expect(await screen.findByText("App Redesign")).toBeInTheDocument();
  });

  it("shows empty state when no projects", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => viewerResponse })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ projects: [] }) });

    render(<ProjectsPage />);
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it("opens create dialog on + New Project click", async () => {
    mockSuccessfulLoad();
    render(<ProjectsPage />);

    const button = await screen.findByRole("button", { name: /new project/i });
    await userEvent.click(button);
    expect(await screen.findByLabelText(/name/i)).toBeInTheDocument();
  });

  it("calls signOut and redirects on 401 from fetchViewer", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401,
      json: async () => ({ error: { code: "unauthorized", message: "Bad token" } }),
    });

    render(<ProjectsPage />);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("shows error banner with retry on 500 from fetchViewer — does NOT redirect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      json: async () => ({ error: { code: "bootstrap_failed", message: "Server error" } }),
    });

    render(<ProjectsPage />);
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("calls signOut and redirects on 401 from fetchProjects", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => viewerResponse })
      .mockResolvedValueOnce({
        ok: false, status: 401,
        json: async () => ({ error: { code: "unauthorized", message: "Bad token" } }),
      });

    render(<ProjectsPage />);
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("shows inline error on 409 project_slug_taken during create", async () => {
    mockSuccessfulLoad();
    render(<ProjectsPage />);

    const newBtn = await screen.findByRole("button", { name: /new project/i });
    await userEvent.click(newBtn);

    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.type(nameInput, "Duplicate");

    mockFetch.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: { code: "project_slug_taken", message: "Slug taken." } }),
    });

    const submitBtn = screen.getByRole("button", { name: /create/i });
    await userEvent.click(submitBtn);
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it("shows inline error on 500 project_create_failed during create", async () => {
    mockSuccessfulLoad();
    render(<ProjectsPage />);

    const newBtn = await screen.findByRole("button", { name: /new project/i });
    await userEvent.click(newBtn);

    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.type(nameInput, "Failing");

    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      json: async () => ({ error: { code: "project_create_failed", message: "Create failed." } }),
    });

    const submitBtn = screen.getByRole("button", { name: /create/i });
    await userEvent.click(submitBtn);
    expect(await screen.findByText(/failed to create/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/web test -- projects`

Expected: FAIL — pages/components not found.

- [ ] **Step 3: Create ProjectSidebar component**

Create `apps/web/src/components/project-sidebar.tsx`:
```tsx
"use client";

import { Avatar, AvatarFallback } from "./ui/avatar";
import { Separator } from "./ui/separator";

interface ProjectSidebarProps {
  workspace: { name: string; type: string } | null;
  projects: Array<{ id: string; name: string }>;
}

export function ProjectSidebar({ workspace, projects }: ProjectSidebarProps) {
  const initial = workspace?.name?.charAt(0).toUpperCase() ?? "L";
  const recentProjects = projects.slice(0, 5);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-neutral-50 p-4">
      {/* Workspace header */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar className="h-7 w-7 rounded">
          <AvatarFallback className="bg-black text-white text-xs font-bold rounded">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {workspace?.name ?? "Workspace"}
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {workspace?.type ?? "Personal"}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Workspace
      </div>
      <div className="text-sm font-medium bg-neutral-100 rounded px-2 py-1.5 mb-1">
        Projects
      </div>
      <div className="text-sm text-muted-foreground px-2 py-1.5 cursor-default opacity-50">
        Settings
      </div>

      <Separator className="my-4" />

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Recent
          </div>
          <div className="space-y-0.5">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                className="text-sm text-muted-foreground px-2 py-1 rounded hover:bg-neutral-100 cursor-pointer truncate"
              >
                {project.name}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Create ProjectList component**

Create `apps/web/src/components/project-list.tsx`:
```tsx
"use client";

import type { ProjectSummary } from "@loomic/shared";

import { Button } from "./ui/button";

interface ProjectListProps {
  projects: ProjectSummary[];
  highlightId?: string | null;
  onCreateClick: () => void;
}

export function ProjectList({ projects, highlightId, onCreateClick }: ProjectListProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button size="sm" onClick={onCreateClick}>
          + New Project
        </Button>
      </div>

      {/* List or empty state */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-4xl mb-4">📂</div>
          <h2 className="text-lg font-medium mb-2">No projects yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first project to get started
          </p>
          <Button onClick={onCreateClick}>+ New Project</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-neutral-50 transition-colors ${
                highlightId === project.id ? "bg-neutral-100 ring-1 ring-neutral-200" : ""
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-100 text-sm">
                📐
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{project.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {project.description ?? "No description"}
                  {" · "}
                  Updated {formatRelativeTime(project.updatedAt)}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">→</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}
```

- [ ] **Step 5: Create CreateProjectDialog component**

Create `apps/web/src/components/create-project-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setLoading(true);
    setError(null);

    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || undefined,
      });
      // Success — reset and close
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const apiErr = err as { code: string };
        if (apiErr.code === "project_slug_taken") {
          setError("A project with this name already exists. Try a different name.");
        } else {
          setError("Failed to create project. Please try again.");
        }
      } else {
        setError("Failed to create project. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setDescription("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="My Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              placeholder="A brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Create projects page**

Create `apps/web/src/app/projects/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CreateProjectDialog } from "../../components/create-project-dialog";
import { ProjectList } from "../../components/project-list";
import { ProjectSidebar } from "../../components/project-sidebar";
import { useAuth } from "../../lib/auth-context";
import {
  fetchViewer,
  fetchProjects,
  createProject,
  ApiAuthError,
  ApiApplicationError,
} from "../../lib/server-api";
import { Button } from "../../components/ui/button";
import type {
  WorkspaceSummary,
  ProjectSummary,
} from "@loomic/shared";

export default function ProjectsPage() {
  const { user, session, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const accessToken = session?.access_token;

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setPageLoading(true);
    setLoadError(null);

    try {
      const viewer = await fetchViewer(accessToken);
      setWorkspace(viewer.workspace);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOut();
        router.replace("/login");
        return;
      }
      setLoadError("Failed to load workspace. Please try again.");
      setPageLoading(false);
      return;
    }

    try {
      const data = await fetchProjects(accessToken);
      setProjects(data.projects);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        await signOut();
        router.replace("/login");
        return;
      }
      setLoadError("Failed to load projects. Please try again.");
    } finally {
      setPageLoading(false);
    }
  }, [accessToken, signOut, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [authLoading, user, router, loadData]);

  async function handleCreate(data: { name: string; description?: string }) {
    if (!accessToken) return;
    const result = await createProject(accessToken, data);
    // Refresh list and highlight new project
    setHighlightId(result.project.id);
    setTimeout(() => setHighlightId(null), 3000);
    try {
      const updated = await fetchProjects(accessToken);
      setProjects(updated.projects);
    } catch {
      // Refresh failed but project was created — add it manually
      setProjects((prev) => [result.project, ...prev]);
    }
  }

  if (authLoading || (!user && !loadError)) return null;

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <ProjectSidebar workspace={workspace} projects={projects} />
      <main className="flex-1 p-6">
        <ProjectList
          projects={projects}
          highlightId={highlightId}
          onCreateClick={() => setDialogOpen(true)}
        />
        <CreateProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleCreate}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @loomic/web test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/projects/ apps/web/src/components/project-sidebar.tsx apps/web/src/components/project-list.tsx apps/web/src/components/create-project-dialog.tsx apps/web/test/projects.test.tsx
git commit -m "feat: add projects page with sidebar, list, and create dialog"
```

---

### Task 7: Update root page redirect and migrate ChatWorkbench styles

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/chat-workbench.tsx`
- Modify: `apps/web/test/chat-workbench.test.tsx`

**Important:** The existing `chat-workbench.test.tsx` imports `HomePage` from `../src/app/page` and renders it to test the ChatWorkbench. After this task, `HomePage` becomes a redirect that returns `null`. The test must be updated to import and render `ChatWorkbench` directly instead of `HomePage`.

- [ ] **Step 1: Rewrite root page as redirect**

Replace `apps/web/src/app/page.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../lib/auth-context";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/projects" : "/login");
  }, [user, loading, router]);

  return null;
}
```

- [ ] **Step 2: Migrate ChatWorkbench CSS-in-JS to Tailwind**

Convert all inline `<style>` blocks in `apps/web/src/components/chat-workbench.tsx` to Tailwind utility classes. Remove the entire `<style>{...}</style>` block at the end of the component. Replace CSS class names with Tailwind utilities on each element. Preserve all functionality — only change styling approach.

Key conversions:
- `.chat-workbench` → `className="mx-auto max-w-[920px] px-6 py-12 text-foreground"`
- `.composer` → `className="grid gap-3 rounded-3xl border bg-white/90 p-6 shadow-lg"`
- `.panels` → `className="mt-1.5 grid gap-6 grid-cols-1 md:grid-cols-2"`
- `.panel` → `className="rounded-3xl border bg-white/90 p-6 shadow-lg"`
- Status badges → conditional Tailwind classes
- Remove the entire `<style>{...}</style>` JSX block

- [ ] **Step 3: Update ChatWorkbench tests — import ChatWorkbench directly**

The key change: replace `import HomePage from "../src/app/page"` with `import { ChatWorkbench } from "../src/components/chat-workbench"`, and replace all `<HomePage />` renders with `<ChatWorkbench />`. All behavioral assertions remain the same — form, buttons, panels, SSE streaming, error states.

```diff
- import HomePage from "../src/app/page";
+ import { ChatWorkbench } from "../src/components/chat-workbench";
```

And in each `render()` call:
```diff
- render(<HomePage />);
+ render(<ChatWorkbench />);
```

- [ ] **Step 4: Run all tests**

Run: `pnpm --filter @loomic/web test`

Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/chat-workbench.tsx apps/web/test/chat-workbench.test.tsx
git commit -m "feat: add root redirect and migrate chat workbench to tailwind"
```

---

### Task 8: Full verification — build, typecheck, and Supabase dashboard config

**Files:**
- Modify: `apps/web/test/env.test.ts` (fix if needed)

- [ ] **Step 1: Run full test suite**

Run:
```bash
pnpm test
```

Expected: ALL PASS (workspace + shared + server + web + desktop).

- [ ] **Step 2: Run typecheck**

Run:
```bash
pnpm typecheck
```

Expected: PASS for all packages (pre-existing web NODE_ENV issue may persist — acceptable).

- [ ] **Step 3: Run build**

Run:
```bash
pnpm build
```

Expected: ALL 6 packages build successfully. Static export in `apps/web/out/` includes `/login`, `/auth/callback`, `/projects` pages.

- [ ] **Step 4: Configure Supabase Dashboard redirect URL**

In Supabase Dashboard for project `ndbwtngvypwgqexcirdo`:
- Go to Authentication > URL Configuration
- Add `http://localhost:3000/auth/callback` to Redirect URLs

- [ ] **Step 5: Smoke test with real Supabase**

Start both server and web:
```bash
# Terminal 1: server
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
set -a; source .env.local; set +a; pnpm --filter @loomic/server dev

# Terminal 2: web
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
pnpm --filter @loomic/web dev
```

Verify:
1. `http://localhost:3000` redirects to `/login`
2. Login page shows split screen layout
3. Enter email → "Send Magic Link" sends email (check Supabase Dashboard logs)
4. Projects page loads after auth
5. Create project dialog works
6. Signout returns to login

- [ ] **Step 6: Commit any remaining fixes**

```bash
# Stage only relevant fixes — check git status first
git status
git add apps/web/
git commit -m "chore: verify web auth and projects integration"
```
