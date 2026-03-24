# Loomic DeepAgents Supabase Thread Persistence Design

> **Status:** Approved for implementation.

**Goal:** Introduce official DeepAgents/LangGraph thread persistence for new chat sessions so each session maps to one durable thread in Supabase-backed storage.

**Architecture:** A `chat_session` becomes the business-level conversation boundary and owns one stable `thread_id`. `apps/server` resolves that `thread_id`, binds it to DeepAgents/LangGraph persistence, and keeps checkpoint/store access server-only. `chat_messages` remain the UI and audit log, not the primary agent-state recovery mechanism.

**Tech Stack:** `TypeScript`, `Fastify`, `deepagents`, `@langchain/langgraph`, `Supabase Postgres`, `zod`, `vitest`, `Next.js`

---

## Context

Loomic already has:

- Supabase-backed `chat_sessions`
- Supabase-backed `chat_messages`
- a DeepAgents runtime in `apps/server`
- a web chat UI that can create sessions and stream runs

The current runtime is still effectively stateless across runs because it only sends the latest user prompt into the agent runtime. That means the product presents a multi-turn chat surface while the agent behaves more like a fresh run on every message.

This design fixes that mismatch by aligning Loomic's session model with the official DeepAgents/LangGraph persistence model instead of layering a custom "replay the whole transcript every time" strategy on top.

## Problem Statement

Current behavior has three structural gaps:

1. `chat_session` does not own a durable agent thread identifier.
2. The agent runtime does not bind runs to LangGraph persistence keyed by `thread_id`.
3. The frontend and runtime currently diverge on session identity, which weakens the meaning of a "session" as the user sees it.

As a result:

- conversation continuity is not guaranteed
- agent-internal state cannot be restored correctly
- checkpointed progress and store-backed memory are unavailable
- the UI's persisted transcript is not equivalent to agent state

## Decision

Use official DeepAgents/LangGraph persistence as the primary conversation state mechanism.

Specifically:

- each new `chat_session` gets one stable `thread_id`
- `apps/server` resolves `thread_id` from `sessionId`
- DeepAgents/LangGraph checkpointer and store are backed by Supabase
- `chat_messages` continue to exist for rendering and auditability only
- old sessions are not migrated during this development-phase feature

## Non-Goals

- migrating existing `chat_sessions` into the new model
- rebuilding agent history from `chat_messages` as the primary persistence path
- exposing checkpoint/store tables or semantics directly to the web client
- changing the client SSE contract
- redesigning the chat UI interaction model

## Design Principles

### Session is the business boundary

The user-visible chat session is the primary application concept. A session maps one-to-one to one agent thread.

### Thread is the agent boundary

`thread_id` is not a checkpoint payload. It is the stable thread key used by the checkpointer to load and persist thread state.

### Transcript is not runtime state

`chat_messages` are useful for UI rendering, search, audit, and product semantics. They are not the authoritative representation of DeepAgents/LangGraph runtime state.

### Server owns persistence internals

The frontend should not know how checkpoints, stores, or thread persistence are implemented. `apps/server` remains the application boundary.

## Data Model

### Existing tables kept

- `chat_sessions`
- `chat_messages`

### Existing table changes

`chat_sessions`

- add `thread_id text not null unique`
- assign on session creation for all new sessions

### New tables

Introduce Supabase tables for LangGraph persistence and Loomic run bookkeeping.
Prefer the official LangGraph saver/store contract and table shape if a production-ready JavaScript Postgres implementation is available in the installed dependency set. Only fall back to Loomic-owned tables where the framework contract requires an adapter that the current package set does not provide.

1. `agent_runs`
   - purpose: track each run launched against a session/thread
   - key fields:
     - `id`
     - `session_id`
     - `thread_id`
     - `status`
     - `model`
     - `created_at`
     - `completed_at`
     - `error_code`
     - `error_message`

2. `agent_checkpoints`
   - purpose: store persisted checkpoint state keyed by thread and checkpoint metadata
   - key fields:
     - `thread_id`
     - `checkpoint_ns`
     - `checkpoint_id`
     - `parent_checkpoint_id`
     - `payload`
     - `created_at`

3. `agent_checkpoint_writes`
   - purpose: optional normalized write log for LangGraph checkpoint writes if the chosen saver pattern needs it
   - key fields:
     - `thread_id`
     - `checkpoint_ns`
     - `checkpoint_id`
     - `task_id`
     - `channel`
     - `idx`
     - `value`
     - `created_at`

4. `agent_store_items`
   - purpose: store-backed long-term memory / namespace entries
   - key fields:
     - `namespace`
     - `key`
     - `value`
     - `created_at`
     - `updated_at`

The exact checkpoint table shape should follow the current LangGraph saver contract whenever possible. The implementation should prefer an official or framework-aligned Postgres layout over a Loomic-invented alternative.

## Request and Runtime Flow

### Session creation

When the web app creates a new session:

1. `apps/server` creates the `chat_sessions` row
2. the same operation assigns a new stable `thread_id`
3. the created session response returns the normal session payload
4. frontend stores only the session id and title as it does today

### Sending a message

When the user sends a message:

1. frontend uses the active `sessionId`
2. frontend no longer fabricates a session identifier from `canvasId`
3. `POST /api/agent/runs` carries the real `sessionId`
4. `apps/server` loads the session and its `thread_id`
5. runtime invokes DeepAgents/LangGraph with persistence bound to that `thread_id`
6. streamed events continue through the existing SSE contract
7. user and assistant transcript entries still persist to `chat_messages`
8. run metadata persists to `agent_runs`

### Resuming a conversation

When a later message arrives for the same session:

1. the same `thread_id` is reused
2. checkpointer restores thread-scoped state
3. store-backed memory remains available through the same runtime
4. the agent continues from official persisted state rather than a manually replayed transcript

## Backend Architecture

### Session Thread Resolver

Add a server-side feature module responsible for:

- generating `thread_id` for new sessions
- reading `thread_id` by `sessionId`
- enforcing that runs cannot start without a persisted session-thread binding

### Persistence Adapter Layer

Add a dedicated adapter module in `apps/server` that:

- encapsulates Supabase reads/writes for LangGraph checkpoint persistence
- encapsulates Supabase reads/writes for store-backed memory
- exposes a narrow interface to runtime code

This isolates framework-specific persistence semantics from the rest of the application.

### Runtime Integration

Update the DeepAgents runtime creation path so that:

- run creation resolves the `thread_id`
- the thread id is passed into the LangGraph config for persistence
- `createDeepAgent` receives the Supabase-backed `checkpointer` and `store`
- backend construction continues to use DeepAgents' native backend extension points rather than a parallel Loomic persistence path

No custom history reconstruction should be the primary path for new sessions.

## Frontend Changes

The web client remains intentionally simple.

Required changes:

- use the actual active session id when creating runs
- continue persisting transcript messages as before
- do not know about checkpoint ids, store namespaces, or persistence internals

Not required:

- new client persistence logic
- client-side thread recovery logic
- direct database access to checkpoint/store tables

## Error Handling

### Missing thread binding

If a run is requested for a session without `thread_id`, fail fast with a server error or explicit validation error. New sessions should always have one.

### Persistence write failure

If checkpoint/store persistence fails, treat the run as failed. Do not silently fall back to transcript replay because that would hide a broken persistence path.

### Old sessions

Old sessions created before this feature are out of scope. During development, the UI may continue to list them, but they are not guaranteed to resume through the new persistence path unless explicitly upgraded in the future.

## Testing Strategy

### Database and schema tests

- new session creation persists `thread_id`
- thread ids are unique
- new persistence tables are created with expected constraints

### Server unit and integration tests

- creating a run for a new session resolves the correct `thread_id`
- repeated runs for the same session reuse the same `thread_id`
- runtime passes persistence config into DeepAgents/LangGraph
- run metadata is recorded in `agent_runs`
- persistence failures surface as explicit run failures

### Frontend tests

- run creation uses active `sessionId`
- switching sessions changes which session id is used for the next run
- current chat rendering behavior remains stable

## Rollout Plan

### Phase 1

- add schema changes
- generate and persist `thread_id`
- correct frontend run/session identity
- wire runtime to resolve session -> thread

### Phase 2

- implement Supabase-backed checkpointer/store adapters
- persist run metadata
- add tests for resumed thread behavior

## Acceptance Criteria

This feature is complete when:

- a newly created chat session always has a stable `thread_id`
- repeated runs in the same session reuse the same `thread_id`
- DeepAgents/LangGraph persistence uses Supabase-backed checkpointer/store
- the web client sends the real active session id
- `chat_messages` remain for UI transcript rendering
- no custom transcript replay is required for the primary persistence path
- baseline test coverage is updated and passing

## Open Implementation Note

Before coding, inspect the installed `deepagents` and `@langchain/langgraph` packages for the current JavaScript persistence API shape and prefer the official saver/store contract over any Loomic-specific approximation.
