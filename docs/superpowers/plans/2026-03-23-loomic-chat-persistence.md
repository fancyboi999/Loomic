# Chat Persistence & Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist chat messages and enable multi-session chat per canvas.

**Architecture:** New Supabase tables + server session/message CRUD + frontend session selector in chat sidebar.

**Tech Stack:** React 19, Next.js (static export), Tailwind v4, Supabase, Fastify, Zod.

---

### Task 1: Database migration and shared contracts

**Files:**
- Create: `supabase/migrations/20260323000006_chat_sessions.sql`
- Modify: `packages/shared/src/supabase/database.ts` — add chat_sessions, chat_messages types
- Modify: `packages/shared/src/contracts.ts` — add session/message schemas
- Modify: `packages/shared/src/http.ts` — add session HTTP schemas

**What to build:**

1. SQL migration with `chat_sessions` and `chat_messages` tables
2. RLS policies: workspace members can CRUD sessions/messages for canvases in their workspace
3. updated_at trigger on chat_sessions
4. TypeScript database types
5. Shared Zod schemas: `chatSessionSchema`, `chatMessageSchema`
6. HTTP schemas: session list response, session create response, message list response, message create request

### Task 2: Server chat service and routes

**Files:**
- Create: `apps/server/src/features/chat/chat-service.ts`
- Create: `apps/server/src/http/chat.ts`
- Modify: `apps/server/src/app.ts` — register chat routes
- Create: `apps/server/test/chat-routes.test.ts`

**What to build:**

1. Chat service with methods:
   - `listSessions(user, canvasId)` — list sessions for canvas
   - `createSession(user, canvasId, title?)` — create new session
   - `deleteSession(user, sessionId)` — delete session + cascade messages
   - `listMessages(user, sessionId)` — load messages for session
   - `createMessage(user, sessionId, role, content, toolActivities?)` — save message

2. Chat routes:
   - `GET /api/canvases/:canvasId/sessions` — list sessions
   - `POST /api/canvases/:canvasId/sessions` — create session
   - `DELETE /api/sessions/:sessionId` — delete session
   - `GET /api/sessions/:sessionId/messages` — list messages
   - `POST /api/sessions/:sessionId/messages` — save message

3. Register in app.ts, add DELETE to CORS methods

4. Tests for all routes

### Task 3: Frontend session management and message persistence

**Files:**
- Create: `apps/web/src/components/session-selector.tsx`
- Modify: `apps/web/src/components/chat-sidebar.tsx` — session state + message persistence
- Modify: `apps/web/src/app/canvas/page.tsx` — pass accessToken to ChatSidebar
- Modify: `apps/web/src/lib/server-api.ts` — add session/message API functions

**What to build:**

1. Server API functions: `fetchSessions`, `createSession`, `deleteSession`, `fetchMessages`, `saveMessage`

2. SessionSelector component: compact dropdown in chat header showing session list, active session highlight, "New Chat" button, delete option

3. ChatSidebar updates:
   - Accept `accessToken` prop
   - Track `activeSessionId` state
   - On mount: fetch sessions, select most recent or create first session
   - On session switch: load messages from server
   - After user sends: POST user message to server
   - After assistant stream completes: POST assistant message to server
   - Auto-title: update session title from first user message

4. Canvas page: pass accessToken to ChatSidebar

### Task 4: Full verification

- TypeScript typecheck across all packages
- All server tests pass
- All web tests pass
- Next.js build succeeds
