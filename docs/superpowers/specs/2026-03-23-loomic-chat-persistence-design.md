# Loomic Chat Persistence & Session Management Design

> **Status:** Approved. Phase 2 of Chat integration: message persistence and session switching.

**Goal:** Persist chat messages to Supabase so conversations survive page refresh, and allow multiple chat sessions per canvas with session switching UI.

**Architecture:** New Supabase tables (`chat_sessions`, `chat_messages`) + server endpoints for session CRUD + frontend session selector in chat sidebar. Messages saved server-side during SSE streaming and loaded on session switch.

**Tech Stack:** React 19, Next.js (static export), Tailwind v4, Supabase, Fastify.

---

## Scope

**This spec:**
- Chat session persistence (create, list, switch, delete)
- Message persistence (save user + assistant messages to Supabase)
- Load message history on session switch
- "New Chat" button

**Deferred:**
- Markdown rendering in messages (Phase 3)
- Image result display (Phase 3)
- Message editing/regeneration (Phase 3)
- Search across sessions (Phase 3)

---

## Database

### `chat_sessions` table

```sql
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Chat',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### `chat_messages` table

```sql
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  tool_activities jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: Members of the workspace containing the canvas can read/write.

## API Endpoints

### GET /api/canvases/:canvasId/sessions

List chat sessions for a canvas, ordered by updated_at desc.

Response:
```json
{
  "sessions": [
    { "id": "uuid", "title": "New Chat", "updatedAt": "2026-03-23T..." }
  ]
}
```

### POST /api/canvases/:canvasId/sessions

Create a new session.

Response:
```json
{
  "session": { "id": "uuid", "title": "New Chat", "updatedAt": "..." }
}
```

### DELETE /api/sessions/:sessionId

Delete a session and all its messages.

### GET /api/sessions/:sessionId/messages

Load all messages for a session.

Response:
```json
{
  "messages": [
    { "id": "uuid", "role": "user", "content": "Hello", "createdAt": "..." },
    { "id": "uuid", "role": "assistant", "content": "Hi!", "toolActivities": [...], "createdAt": "..." }
  ]
}
```

### POST /api/sessions/:sessionId/messages

Save a message (called after user sends or assistant completes).

Request:
```json
{
  "role": "user",
  "content": "Hello"
}
```

## Frontend Changes

### Chat Sidebar Updates

1. **Session selector** in header: dropdown showing session list + "New Chat" button
2. **Load messages** on session switch from `/api/sessions/:id/messages`
3. **Auto-create session** on first message if no session exists
4. **Save messages** after user sends (POST user message) and after assistant stream completes (POST assistant message)
5. **Auto-title** first session based on first user message (truncated to 50 chars)

### Component Updates

- `ChatSidebar`: Add session state, session list fetch, session switching
- New: `SessionSelector` component (compact dropdown in chat header)
- Canvas page: Pass accessToken to ChatSidebar for API calls

## File Structure

```
supabase/migrations/
└── 20260323000006_chat_sessions.sql     ← NEW

packages/shared/src/
├── contracts.ts                          ← MODIFY: add session/message schemas
├── http.ts                               ← MODIFY: add session HTTP schemas

apps/server/src/
├── features/
│   └── chat/
│       └── chat-service.ts               ← NEW
├── http/
│   └── chat.ts                           ← NEW

apps/web/src/
├── components/
│   ├── chat-sidebar.tsx                  ← MODIFY: session management
│   └── session-selector.tsx              ← NEW
├── lib/
│   └── server-api.ts                     ← MODIFY: add session API functions
```
