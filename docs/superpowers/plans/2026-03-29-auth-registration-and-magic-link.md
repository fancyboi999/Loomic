# Auth Registration And Magic Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email+password registration, keep password sign-in, make login-page magic link login-only, and make `/auth/callback` reliably recover and redirect authenticated sessions to `/home`.

**Architecture:** Keep browser-side Supabase auth in `apps/web`, preserve `AuthProvider` as the single session boundary, split sign-in and sign-up surfaces into distinct pages/components, and make callback recovery explicit instead of passive. Do not move auth into `apps/server`.

**Tech Stack:** Next.js App Router, React 19, Supabase JS v2 browser client, Vitest + Testing Library, Tailwind/shadcn UI.

---

## File Map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/app/login/page.tsx` | Sign-in page container, redirects authenticated users to `/home`, links to register |
| `apps/web/src/app/register/page.tsx` | New registration page container, redirects authenticated users to `/home`, links back to login |
| `apps/web/src/app/auth/callback/page.tsx` | Explicit auth callback recovery and redirect handling |
| `apps/web/src/components/auth/auth-shell.tsx` | Shared auth split-screen shell/layout |
| `apps/web/src/components/login-form.tsx` | Sign-in modes: password, magic link, Google; magic link must not auto-create users |
| `apps/web/src/components/register-form.tsx` | Email+password registration UI and post-submit success state |
| `apps/web/src/lib/supabase-browser.ts` | Shared Supabase browser client config aligned with callback recovery |
| `apps/web/test/login.test.tsx` | Login screen regression tests |
| `apps/web/test/auth-callback.test.tsx` | Callback recovery tests |
| `apps/web/test/register.test.tsx` | Registration page and sign-up flow tests |

## Task 1: Lock In Auth Flow Tests

**Files:**
- Modify: `apps/web/test/login.test.tsx`
- Modify: `apps/web/test/auth-callback.test.tsx`
- Create: `apps/web/test/register.test.tsx`

- [ ] **Step 1: Expand login tests to reflect current product routing**

Add assertions that:
- login page links to register
- successful auth flow targets `/home`, not `/projects`
- sign-in options still render

- [ ] **Step 2: Add failing callback recovery tests**

In `apps/web/test/auth-callback.test.tsx`, add tests for:
- explicit recovery path redirects to `/home`
- recovery failure redirects to `/login`
- loading UI shows while callback is processing

- [ ] **Step 3: Add failing register page tests**

Create `apps/web/test/register.test.tsx` covering:
- `/register` shell renders
- email/password fields render
- submit calls Supabase sign-up path
- success state explains next step
- authenticated users are redirected to `/home`

- [ ] **Step 4: Run targeted auth tests and confirm red**

Run: `pnpm --filter @loomic/web test -- login auth-callback register`

Expected: FAIL with missing register page / missing updated callback behavior / stale `/projects` expectations.

- [ ] **Step 5: Commit the test-only red state**

```bash
git add apps/web/test/login.test.tsx apps/web/test/auth-callback.test.tsx apps/web/test/register.test.tsx
git commit -m "test: cover registration and auth callback flows"
```

## Task 2: Build Shared Auth Surface And Registration

**Files:**
- Create: `apps/web/src/components/auth/auth-shell.tsx`
- Create: `apps/web/src/components/register-form.tsx`
- Modify: `apps/web/src/components/login-form.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/register/page.tsx`

- [ ] **Step 1: Create shared auth shell**

Implement `auth-shell.tsx` as the split-screen layout extracted from the current login page so login and register reuse the same frame without duplicating brand copy and structure.

- [ ] **Step 2: Refactor login page to use the shell**

Move layout responsibilities out of `login/page.tsx`, keep only:
- auth redirect guard
- page title/subtitle props
- `LoginForm`
- link to `/register`

- [ ] **Step 3: Update login form to be login-only**

In `login-form.tsx`:
- keep password sign-in
- keep Google OAuth
- keep magic link sign-in
- ensure magic link path is sign-in-only and does not silently create accounts
- keep inline errors and sent state

- [ ] **Step 4: Implement register form**

In `register-form.tsx`:
- collect email + password
- call Supabase sign-up
- surface inline validation/auth errors
- show success state for email verification
- redirect to `/home` when sign-up immediately yields a session

- [ ] **Step 5: Create register page**

Build `apps/web/src/app/register/page.tsx` with:
- `useAuth()` redirect guard to `/home`
- shared auth shell
- `RegisterForm`
- link back to `/login`

- [ ] **Step 6: Run targeted auth tests and confirm green for UI flow**

Run: `pnpm --filter @loomic/web test -- login register`

Expected: PASS

- [ ] **Step 7: Commit UI auth surface changes**

```bash
git add apps/web/src/components/auth/auth-shell.tsx apps/web/src/components/register-form.tsx apps/web/src/components/login-form.tsx apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx apps/web/test/login.test.tsx apps/web/test/register.test.tsx
git commit -m "feat: add dedicated registration flow"
```

## Task 3: Make Callback Recovery Explicit

**Files:**
- Modify: `apps/web/src/app/auth/callback/page.tsx`
- Modify: `apps/web/src/lib/supabase-browser.ts`
- Modify: `apps/web/test/auth-callback.test.tsx`

- [ ] **Step 1: Write/adjust failing callback tests for explicit recovery**

Ensure tests verify:
- page actively tries to finalize callback session
- success redirects to `/home`
- failure redirects to `/login`

- [ ] **Step 2: Implement explicit callback recovery**

In `auth/callback/page.tsx`:
- inspect the redirect URL
- attempt explicit session recovery when code-based callback data exists
- fall back to current session check
- redirect to `/home` on success
- redirect to `/login?error=auth_callback_failed` on failure

- [ ] **Step 3: Align browser client config**

In `supabase-browser.ts`, keep one shared client and ensure its auth configuration is compatible with explicit callback recovery. Do not introduce multiple browser clients.

- [ ] **Step 4: Run callback test suite**

Run: `pnpm --filter @loomic/web test -- auth-callback`

Expected: PASS

- [ ] **Step 5: Commit callback hardening**

```bash
git add apps/web/src/app/auth/callback/page.tsx apps/web/src/lib/supabase-browser.ts apps/web/test/auth-callback.test.tsx
git commit -m "fix: make auth callback recover sessions explicitly"
```

## Task 4: End-To-End Auth Regression Pass

**Files:**
- Modify as needed based on failures from previous tasks

- [ ] **Step 1: Run the full auth-focused test set**

Run: `pnpm --filter @loomic/web test -- auth-context login auth-callback register`

Expected: PASS

- [ ] **Step 2: Run targeted typecheck grep for touched auth files**

Run:

```bash
pnpm --filter @loomic/web exec tsc -p tsconfig.json --noEmit 2>&1 | rg "login-form|register-form|auth-shell|auth/callback|app/login|app/register|supabase-browser"
```

Expected: no matches for touched auth files

- [ ] **Step 3: Manual verification checklist**

Run locally:
- register new account
- sign out
- sign in with password
- sign out
- send magic link
- confirm callback reaches `/home`

- [ ] **Step 4: Commit final cleanup**

```bash
git add apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx apps/web/src/app/auth/callback/page.tsx apps/web/src/components apps/web/src/lib/supabase-browser.ts apps/web/test
git commit -m "test: verify auth registration and magic link flows"
```
