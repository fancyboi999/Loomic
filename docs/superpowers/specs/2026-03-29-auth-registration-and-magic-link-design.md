# Loomic Auth Registration And Magic Link Design

> **Status:** Drafted for autonomous execution. User explicitly requested end-to-end progress in a dedicated worktree.

**Goal:** Add first-class account registration, keep email+password sign-in, and make the magic link flow reliably complete the browser session and redirect into the current `/home` workspace.

**Recommendation:** Use a split auth surface with shared building blocks: keep `/login`, add `/register`, keep Google OAuth, keep magic link as a login option, and make `/auth/callback` explicitly recover the session instead of passively waiting for context state to change.

## Current State

The current web auth layer already uses browser-side Supabase auth:

- [apps/web/src/components/login-form.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/components/login-form.tsx)
- [apps/web/src/lib/auth-context.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/lib/auth-context.tsx)
- [apps/web/src/lib/supabase-browser.ts](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/lib/supabase-browser.ts)
- [apps/web/src/app/auth/callback/page.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/app/auth/callback/page.tsx)

What exists today:

- Email magic link sign-in UI exists.
- Email+password sign-in UI exists.
- Google OAuth sign-in exists.
- Auth state is exposed through `AuthProvider`.
- Protected workspace routes redirect unauthenticated users to `/login`.

What is missing or weak:

- There is no registration path for email+password users.
- The callback page only waits for `useAuth()` to eventually produce a user; it does not explicitly finalize a code-based callback.
- Historical auth tests and old design docs still refer to `/projects`, but the current product route is `/home`.
- Login and future registration concerns are crammed into one component path with no explicit flow boundary.

## Why Magic Link Feels Broken

The current callback behavior is too passive.

`/auth/callback` currently does this:

1. Mount page
2. Wait for `AuthProvider` to surface `user`
3. Redirect to `/home` if a user appears
4. Timeout back to `/login` if no user appears

That works only when the Supabase client auto-detects and recovers the session with no ambiguity. In practice, browser redirects, code-vs-hash callback formats, and timing around client initialization can make this feel flaky. The callback page should own session recovery instead of hoping the context finishes in time.

## Approaches Considered

### Option 1: Patch the Existing Login Form In Place

Keep one page and one big form. Add a `register` mode, wire `supabase.auth.signUp`, and minimally patch callback recovery.

Pros:

- Smallest diff
- Fastest to ship

Cons:

- `login-form.tsx` keeps accumulating unrelated responsibilities
- Registration, sign-in, magic link, and OAuth state stay tangled
- Harder to add forgot-password and email verification UX later

### Option 2: Split Auth Surface, Share Internal Building Blocks

Keep `/login`, add `/register`, reuse a shared auth card/email form layer, and make callback recovery explicit.

Pros:

- Clean mental model for sign-in vs sign-up
- Easy to grow into forgot-password / resend-verification
- Keeps files focused and reduces auth-state branching inside a single component
- Best fit for real product behavior

Cons:

- Slightly more file work than a patch-in-place approach

### Option 3: Move Auth Behind `apps/server`

Proxy sign-up/sign-in through server routes and stop using browser-side Supabase auth directly.

Pros:

- Centralized control
- Easier policy enforcement later

Cons:

- Overkill for current architecture
- Fights the existing `AuthProvider` and browser Supabase session model
- Slower, riskier, and not needed for this scope

## Chosen Design

Choose Option 2.

This keeps the existing browser-auth foundation intact, fixes the actual reliability hole in callback recovery, and adds registration without turning auth into a monolith or dragging the server into concerns it does not need to own yet.

## Product Behavior

### `/login`

`/login` remains the primary sign-in surface and supports:

- Email + password sign-in
- Magic link sign-in
- Google OAuth sign-in
- Link to `/register`

Magic link remains a sign-in path, not a sign-up path.

Implementation rule:

- The login-page magic link call must explicitly disable auto-user-creation so non-existent emails do not silently become accounts.

### `/register`

`/register` is the new account creation surface and supports:

- Email + password account creation via `supabase.auth.signUp`
- Optional transition back to `/login`
- Clear message when verification email has been sent

If Supabase project settings require email confirmation, the UI should tell the user to check email before trying to sign in. If the session is returned immediately, redirect to `/home`.

Registration owns account creation semantics. The login page should never implicitly create an account on behalf of the user.

### `/auth/callback`

`/auth/callback` becomes an explicit auth finalization page.

Responsibilities:

- Normalize and recover browser auth session from redirect URL
- Support the current callback shape used by Google OAuth and magic link
- Redirect authenticated users to `/home`
- Redirect failures back to `/login` with an understandable error state

This page should not just wait on `AuthProvider`; it should actively attempt session recovery first, then let `AuthProvider` reflect the resolved session.

## Technical Design

### Supabase Browser Client

[apps/web/src/lib/supabase-browser.ts](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/lib/supabase-browser.ts)

Keep a single lazy browser client, but align it with explicit callback handling.

Design requirements:

- Preserve one shared browser client instance
- Keep URL-based session detection enabled
- Do not rely solely on implicit timing
- Make callback page responsible for explicit recovery when a code-based redirect is present

### Auth Context

[apps/web/src/lib/auth-context.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/lib/auth-context.tsx)

`AuthProvider` should remain the single source of truth for:

- `user`
- `session`
- `loading`
- `signOut`

No business data should be moved into auth context. Keep it focused on session state only.

### UI Decomposition

Recommended file structure:

- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/app/auth/callback/page.tsx`
- `apps/web/src/components/login-form.tsx`
- `apps/web/src/components/register-form.tsx`
- `apps/web/src/components/auth/auth-shell.tsx`
- `apps/web/src/components/auth/auth-status-message.tsx`

This avoids putting all auth logic into one component while still reusing layout and message primitives.

### Callback Recovery Logic

The callback page should attempt recovery in this order:

1. Read current browser location
2. If the redirect contains an auth `code`, explicitly exchange it for a session
3. Otherwise, allow the existing client URL detection path to run
4. Re-check current session
5. Redirect to `/home` on success
6. Redirect to `/login` with an error query on failure

The page should show a deterministic loading state while this happens.

### Route Consistency

Auth routes and tests should stop pointing to `/projects`.

Current product truth is `/home`, so auth success and callback success should consistently land there.

Files likely affected:

- [apps/web/src/app/login/page.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/app/login/page.tsx)
- [apps/web/src/app/auth/callback/page.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/src/app/auth/callback/page.tsx)
- [apps/web/test/login.test.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/test/login.test.tsx)
- [apps/web/test/auth-callback.test.tsx](/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/auth-registration/apps/web/test/auth-callback.test.tsx)

## Error Handling

### Sign-In Errors

For password sign-in and OAuth:

- Show Supabase error text in a user-readable inline error area
- Do not clear the email field
- Do not silently fail

### Sign-Up Errors

For registration:

- Show duplicate-email / invalid-password errors inline
- Preserve form values except password if security posture calls for reset
- If email verification is required, show a success state that explains the next step

### Callback Errors

If callback recovery fails:

- Redirect to `/login?error=<code>`
- Render a small error banner on `/login` when that query exists

This is better than silently dropping users back to login with no explanation.

## Testing Strategy

### Unit / Component

Add or update tests for:

- Login page renders sign-in options and `/register` link
- Register page renders registration form and `/login` link
- Register flow calls `supabase.auth.signUp`
- Callback page recovers a session and redirects to `/home`
- Callback page redirects back to `/login` on failure

### Integration

Validate:

- Unauthenticated user can reach `/login` and `/register`
- Authenticated user visiting `/login` or `/register` is redirected to `/home`
- Workspace layout still blocks unauthenticated access

### Manual Verification

Minimum manual flow:

1. Register with email+password
2. Sign out
3. Sign in with password
4. Sign out
5. Send magic link
6. Open callback and confirm redirect to `/home`
7. Test Google OAuth if provider is configured locally

## Scope Exclusions

Not part of this pass:

- Forgot password
- Password reset flow
- Resend verification UI
- Invite-based team onboarding
- Server-proxied auth

## Implementation Notes

Keep this work aligned with current architecture:

- Browser auth stays in `apps/web`
- Business APIs stay in `apps/server`
- Do not introduce server-side session cookies or Next middleware auth gates in this pass
- Keep files under roughly one responsibility each; do not let `login-form.tsx` become the permanent home for sign-up logic

## Success Criteria

This work is complete when:

- Users can create accounts with email+password
- Users can sign in with email+password
- Users can still sign in with magic link
- Magic link callback reliably results in an authenticated browser session
- Auth success consistently redirects to `/home`
- Tests reflect `/home`, not stale `/projects` behavior
