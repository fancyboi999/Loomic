# API Performance Optimization Design

## Problem

All API endpoints take 1.5–4.5 seconds. Root causes:

1. **Remote auth on every request**: `auth.getUser()` makes a network call to Supabase (~500ms) on every API request
2. **Frontend duplicate requests**: React 18 StrictMode double-mount causes `BrandKitSelector` and `ChatSidebar` to fire identical requests twice in dev mode

## Solution Overview

### 1. Local JWT Verification (Backend)

Replace `client.auth.getUser()` with local JWT verification using `jose`.

**Current flow** (per request):
```
createClient() → auth.getUser() [network ~500ms] → return user
```

**New flow**:
```
jwtVerify(token, secret) [local ~1ms] → return user from JWT payload
```

**Changes**:
- File: `apps/server/src/supabase/user.ts`
- Add `SUPABASE_JWT_SECRET` to `ServerEnv` and `.env.local`
- Install `jose` in `apps/server`
- `authenticate()` decodes JWT locally: verify signature, check `exp`, extract `sub` (user ID), `email`, `user_metadata`
- Add in-memory cache (Map with TTL 5 min) keyed by token to avoid re-parsing the same JWT repeatedly
- Fallback: if `SUPABASE_JWT_SECRET` is not set, fall back to current `auth.getUser()` behavior for backwards compatibility

**JWT payload structure** (Supabase access tokens):
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "user_metadata": { ... },
  "exp": 1234567890,
  "aud": "authenticated",
  "role": "authenticated"
}
```

### 2. Frontend Request Deduplication

Add a module-level `dedupeRequest(key, fn)` utility that deduplicates concurrent identical requests by sharing the same Promise.

**Behavior**:
- If a request with the same key is already in-flight, return the existing Promise
- Once the Promise resolves/rejects, clear it from the map (allow future requests)
- No TTL caching — this only deduplicates concurrent requests, not repeat requests over time

**Changes**:
- New file: `apps/web/src/lib/dedupe-request.ts` (~15 lines)
- Wrap `fetchBrandKits` in `brand-kit-api.ts` with `dedupeRequest`
- Wrap `fetchSessions` in `server-api.ts` with `dedupeRequest`

## Files Changed

| File | Change |
|------|--------|
| `apps/server/src/supabase/user.ts` | Replace `auth.getUser()` with `jose.jwtVerify()` + cache |
| `apps/server/src/config/env.ts` | Add `supabaseJwtSecret` field |
| `apps/server/package.json` | Add `jose` dependency |
| `.env.local` | Add `SUPABASE_JWT_SECRET` |
| `.env.example` | Add `SUPABASE_JWT_SECRET` placeholder |
| `apps/web/src/lib/dedupe-request.ts` | New: dedupeRequest utility |
| `apps/web/src/lib/brand-kit-api.ts` | Wrap `fetchBrandKits` with dedupeRequest |
| `apps/web/src/lib/server-api.ts` | Wrap `fetchSessions` with dedupeRequest |

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Auth overhead per request | ~500ms | ~1ms |
| `/api/projects` total | ~2200ms | ~1700ms |
| `/api/viewer` total | ~1800ms | ~1300ms |
| Duplicate requests on canvas page | 2-3 extra | 0 |

## Risks

- JWT Secret must be kept secure (server-side only, never exposed to client)
- Local JWT verification won't detect revoked tokens — acceptable tradeoff since Supabase tokens are short-lived (1 hour default)
- `dedupeRequest` only deduplicates concurrent calls; it does NOT cache results across time
