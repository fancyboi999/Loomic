# DeepAgents Supabase Thread Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add official DeepAgents/LangGraph thread persistence for new Loomic chat sessions using Supabase-backed checkpointer/store and stable session-owned `thread_id`.

**Architecture:** `chat_session` becomes the business conversation boundary and owns one durable `thread_id`. `apps/server` creates and resolves `thread_id`, passes it through LangGraph config, and injects Supabase-backed `checkpointer` and `store` into `createDeepAgent`. `chat_messages` remain the UI transcript and audit log; they do not reconstruct agent state.

**Tech Stack:** `TypeScript`, `Fastify`, `deepagents`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint`, `Supabase Postgres`, `zod`, `vitest`, `Next.js`

---

## File Structure

### Existing files to modify

- `apps/server/package.json`
  - declare direct server dependencies for LangGraph persistence interfaces
- `supabase/migrations/20260323000006_chat_sessions.sql`
  - baseline chat schema reference only; do not edit this applied migration
- `packages/shared/src/contracts.ts`
  - request/response contract updates for run creation and session summaries if needed
- `packages/shared/src/contracts.test.ts`
  - contract regression coverage
- `packages/shared/src/supabase/database.ts`
  - generated-style database typings for new columns/tables
- `apps/server/src/features/chat/chat-service.ts`
  - session creation and session lookup behavior
- `apps/server/src/http/chat.ts`
  - session route contract if return shape changes
- `apps/server/src/http/runs.ts`
  - run creation route should validate authenticated session context and pass real session id through runtime
- `apps/server/src/http/sse.ts`
  - keep SSE route imports aligned with runtime service refactors
- `apps/server/src/agent/deep-agent.ts`
  - inject `checkpointer` and `store` into `createDeepAgent`
- `apps/server/src/agent/runtime.ts`
  - bind `thread_id` into LangGraph config and record run metadata
- `apps/server/src/agent/backends/index.ts`
  - ensure backend construction can coexist with LangGraph-backed store/checkpointer config
- `apps/server/src/app.ts`
  - wire new persistence services into chat and run services
- `apps/server/test/chat-routes.test.ts`
  - session creation and retrieval coverage
- `apps/server/test/deep-agent-runtime.test.ts`
  - runtime integration with thread config
- `apps/server/test/mock-runs.test.ts`
  - run route contract changes
- `apps/web/src/components/chat-sidebar.tsx`
  - send real active `sessionId` instead of fabricating one from `canvasId`
- `apps/web/src/components/chat-workbench.tsx`
  - keep demo run creation aligned with the updated `createRun` helper contract
- `apps/web/src/lib/server-api.ts`
  - run request and auth contract changes
- `apps/web/test/chat-workbench.test.tsx`
  - run creation request coverage

### New files to create

- `supabase/migrations/20260324000007_agent_thread_persistence.sql`
  - add `chat_sessions.thread_id` and create persistence tables
- `apps/server/src/features/chat/thread-service.ts`
  - generate and resolve stable `thread_id`
- `apps/server/src/features/agent-runs/agent-run-service.ts`
  - create/update run metadata records
- `apps/server/src/features/agent-runs/types.ts`
  - focused types for run persistence
- `apps/server/src/agent/persistence/supabase-checkpointer.ts`
  - `BaseCheckpointSaver` implementation backed by Supabase
- `apps/server/src/agent/persistence/supabase-store.ts`
  - `BaseStore` implementation backed by Supabase
- `apps/server/src/agent/persistence/index.ts`
  - narrow factory/wiring layer for runtime usage
- `apps/server/test/thread-service.test.ts`
  - server-side thread id creation and resolution
- `apps/server/test/supabase-checkpointer.test.ts`
  - checkpointer persistence behavior
- `apps/server/test/supabase-store.test.ts`
  - store persistence behavior
- `apps/server/test/agent-run-service.test.ts`
  - run persistence behavior
- `apps/server/test/agent-thread-persistence-migration.test.ts`
  - validates migration SQL expectations for thread/session persistence

## Task 1: Add Schema and Shared Contract Support

**Files:**
- Create: `supabase/migrations/20260324000007_agent_thread_persistence.sql`
- Create: `apps/server/test/agent-thread-persistence-migration.test.ts`
- Modify: `apps/server/package.json`
- Modify: `packages/shared/src/supabase/database.ts`
- Modify: `packages/shared/src/contracts.ts`
- Modify: `packages/shared/src/contracts.test.ts`

- [ ] **Step 0: Inspect installed persistence APIs**

Before writing tests or migrations, inspect the installed JavaScript APIs for:
- `BaseCheckpointSaver`
- `BaseStore`
- the exact `RunnableConfig.configurable` requirements for `thread_id`, `checkpoint_id`, and `checkpoint_ns`

Lock the chosen persistence table shape to what the installed contracts actually need. Do not guess from older Python examples or generic LangGraph blog posts.

Decision gate:
- if an official LangGraph JavaScript Postgres saver/store package compatible with the installed stack is available and production-usable, adopt it and align the migration/table shape to that package
- otherwise, proceed with the Loomic-owned Supabase adapter path defined in this plan

- [ ] **Step 1: Write failing contract and type tests**

Add failing expectations in `packages/shared/src/contracts.test.ts` for:
- run creation requiring a real `sessionId`
- session records supporting a server-owned `thread_id` in database typings where applicable
- any new run/session response shape that must remain compatible
- authenticated run helper contract updates if the web client must send bearer auth

- [ ] **Step 2: Run shared contract tests to verify they fail**

Run: `pnpm --filter @loomic/shared test`
Expected: FAIL on new assertions for thread-related contract/type coverage

- [ ] **Step 3: Add the new Supabase migration**

Implement `supabase/migrations/20260324000007_agent_thread_persistence.sql` with:
- `chat_sessions.thread_id text`
- legacy rows allowed to remain null
- partial unique index on non-null `thread_id`
- application-level enforcement that all newly created sessions persist non-null `thread_id`
- `agent_runs`
- `agent_checkpoints`
- `agent_checkpoint_writes`
- `agent_store_items`
- appropriate foreign keys and indexes
- treat new persistence tables as server-only infrastructure tables
- enable RLS on persistence tables with no user-facing policies so only the service-role/admin path can use them

Do not add migration logic for legacy session upgrade beyond keeping old rows untouched during development.

- [ ] **Step 3a: Add direct server package dependencies**

Modify `apps/server/package.json` to declare direct dependencies on:
- `@langchain/langgraph`
- `@langchain/langgraph-checkpoint`

Only add more LangGraph persistence packages if the installed API inspection shows they are required.

- [ ] **Step 3b: Add migration verification coverage**

Create `apps/server/test/agent-thread-persistence-migration.test.ts` so the new SQL is verified for:
- partial uniqueness of non-null `thread_id`
- presence of persistence tables
- expected foreign-key constraints and server-only table posture that runtime code depends on

- [ ] **Step 4: Update shared database typings**

Modify `packages/shared/src/supabase/database.ts` to reflect:
- `chat_sessions.thread_id`
- new tables and columns
- relationships for `agent_runs`

- [ ] **Step 5: Update shared runtime contracts minimally**

Modify `packages/shared/src/contracts.ts` only where required so that:
- run creation continues to use `sessionId` and `conversationId`
- no client-visible checkpoint/store fields leak into public contracts
- existing response schemas stay stable unless implementation requires a narrow additive change

- [ ] **Step 6: Re-run shared tests**

Run: `pnpm --filter @loomic/shared test`
Expected: PASS

Run:
```bash
pnpm --filter @loomic/server vitest run test/agent-thread-persistence-migration.test.ts
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260324000007_agent_thread_persistence.sql \
  pnpm-lock.yaml \
  apps/server/test/agent-thread-persistence-migration.test.ts \
  apps/server/package.json \
  packages/shared/src/supabase/database.ts \
  packages/shared/src/contracts.ts \
  packages/shared/src/contracts.test.ts
git commit -m "feat: add thread persistence schema and shared contracts"
```

## Task 2: Add Server Session Thread and Run Metadata Services

**Files:**
- Create: `apps/server/src/features/chat/thread-service.ts`
- Create: `apps/server/src/features/agent-runs/agent-run-service.ts`
- Create: `apps/server/src/features/agent-runs/types.ts`
- Modify: `apps/server/src/features/chat/chat-service.ts`
- Modify: `apps/server/src/http/chat.ts`
- Modify: `apps/server/src/http/runs.ts`
- Modify: `apps/server/src/http/sse.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/web/src/lib/server-api.ts`
- Test: `apps/server/test/thread-service.test.ts`
- Test: `apps/server/test/agent-run-service.test.ts`
- Test: `apps/server/test/chat-routes.test.ts`
- Test: `apps/server/test/mock-runs.test.ts`
- Test: `apps/web/test/server-api.test.ts`

- [ ] **Step 1: Write failing server tests**

Add failing tests covering:
- creating a session generates and persists `thread_id`
- resolving a session returns the same `thread_id`
- run creation fails cleanly when `sessionId` does not resolve
- authenticated run creation sends bearer auth for persisted chat sessions
- run metadata record is created/updated with thread information

- [ ] **Step 2: Run the targeted server tests to verify RED**

Run:
```bash
pnpm --filter @loomic/server vitest run \
  test/thread-service.test.ts \
  test/agent-run-service.test.ts \
  test/chat-routes.test.ts \
  test/mock-runs.test.ts
pnpm --filter @loomic/web vitest run test/server-api.test.ts
```
Expected: FAIL because thread service and run metadata service do not exist yet

- [ ] **Step 3: Implement thread service**

Create `apps/server/src/features/chat/thread-service.ts` with focused responsibilities:
- generate stable `thread_id` for new sessions
- resolve `thread_id` by `sessionId`
- return explicit null/error for sessions that cannot be resumed

Prefer a UUID/string generator that is opaque to clients and does not overload canvas ids.

- [ ] **Step 4: Update chat service to create sessions with thread binding**

Modify `apps/server/src/features/chat/chat-service.ts` so:
- `createSession` persists `thread_id`
- session listing remains client-safe and does not expose thread internals
- add a helper path for server-side session lookup when runtime needs thread resolution

- [ ] **Step 5: Implement run metadata persistence**

Create `apps/server/src/features/agent-runs/agent-run-service.ts` so the server can:
- persist accepted runs
- update status transitions
- persist model, thread id, timestamps, and error details

- [ ] **Step 6: Wire services into app and routes**

Modify:
- `apps/server/src/app.ts`
- `apps/server/src/http/runs.ts`
- `apps/server/src/http/sse.ts` if type exports or runtime wiring move

So run creation:
- authenticates and verifies ownership for persisted chat-session runs
- resolves the real session/thread binding
- passes required runtime context into `createAgentRunService`
- persists run records

- [ ] **Step 6a: Update the authenticated run helper**

Modify `apps/web/src/lib/server-api.ts` so `createRun` can send bearer auth for real session-backed runs. Keep the helper explicit so non-authenticated demos can still call it intentionally.

- [ ] **Step 6b: Keep the demo workbench aligned**

Update `apps/web/src/components/chat-workbench.tsx` if the `createRun` helper signature changes, so this demo path remains a valid consumer and does not drift from the primary client helper.

- [ ] **Step 7: Re-run targeted server tests**

Run:
```bash
pnpm --filter @loomic/server vitest run \
  test/thread-service.test.ts \
  test/agent-run-service.test.ts \
  test/chat-routes.test.ts \
  test/mock-runs.test.ts
pnpm --filter @loomic/web vitest run test/server-api.test.ts
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/features/chat/thread-service.ts \
  apps/server/src/features/agent-runs/types.ts \
  apps/server/src/features/agent-runs/agent-run-service.ts \
  apps/server/src/features/chat/chat-service.ts \
  apps/server/src/http/chat.ts \
  apps/server/src/http/runs.ts \
  apps/server/src/http/sse.ts \
  apps/server/src/app.ts \
  apps/web/src/lib/server-api.ts \
  apps/server/test/thread-service.test.ts \
  apps/server/test/agent-run-service.test.ts \
  apps/server/test/chat-routes.test.ts \
  apps/server/test/mock-runs.test.ts \
  apps/web/test/server-api.test.ts
git commit -m "feat: bind chat sessions to agent threads"
```

## Task 3: Implement Supabase-Backed Checkpointer and Store Integration

**Files:**
- Create: `apps/server/src/agent/persistence/supabase-checkpointer.ts`
- Create: `apps/server/src/agent/persistence/supabase-store.ts`
- Create: `apps/server/src/agent/persistence/index.ts`
- Modify: `apps/server/src/agent/deep-agent.ts`
- Modify: `apps/server/src/agent/runtime.ts`
- Modify: `apps/server/src/agent/backends/index.ts`
- Test: `apps/server/test/supabase-checkpointer.test.ts`
- Test: `apps/server/test/supabase-store.test.ts`
- Test: `apps/server/test/deep-agent-runtime.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Add failing tests covering:
- `BaseCheckpointSaver` behavior for `put`, `putWrites`, `getTuple`, `list`, `deleteThread`
- `BaseStore` behavior for `get`, `put`, `search`, `delete`, `listNamespaces`
- runtime passing `configurable.thread_id` and using injected `checkpointer`/`store`
- creating two runs for the same session and proving the same `thread_id` is reused while persisted state is restored on the second run
- checkpoint/store write failures surfacing as `run.failed`

- [ ] **Step 2: Run targeted persistence/runtime tests to verify RED**

Run:
```bash
pnpm --filter @loomic/server vitest run \
  test/supabase-checkpointer.test.ts \
  test/supabase-store.test.ts \
  test/deep-agent-runtime.test.ts
```
Expected: FAIL because Supabase-backed persistence adapters are not implemented

- [ ] **Step 3: Implement Supabase checkpointer**

Create `apps/server/src/agent/persistence/supabase-checkpointer.ts` implementing `BaseCheckpointSaver` with:
- serialized checkpoint payload storage
- pending write storage
- thread-scoped lookup and deletion
- careful config parsing for `configurable.thread_id`, `checkpoint_id`, and `checkpoint_ns`

- [ ] **Step 4: Implement Supabase store**

Create `apps/server/src/agent/persistence/supabase-store.ts` implementing `BaseStore` with:
- namespace/key storage
- basic CRUD
- namespace listing
- metadata filter support needed by current runtime

Do not overbuild vector search unless the installed framework path requires it for current DeepAgents usage.

- [ ] **Step 5: Add persistence factories**

Create `apps/server/src/agent/persistence/index.ts` exposing a narrow API to build:
- checkpointer
- store
- any shared serializer/helper utilities

Use the server-side admin/service-role Supabase client for checkpoint/store persistence. Do not route these writes through user-scoped clients.

- [ ] **Step 6: Wire persistence into the agent factory**

Modify `apps/server/src/agent/deep-agent.ts` and `apps/server/src/agent/runtime.ts` so:
- `createDeepAgent` receives `checkpointer` and `store`
- runtime invokes the graph with `configurable.thread_id`
- status/error transitions update run metadata

- [ ] **Step 7: Keep backend composition aligned with DeepAgents**

Modify `apps/server/src/agent/backends/index.ts` only as needed so backend construction stays compatible with injected store/checkpointer and does not create a parallel persistence mechanism.

- [ ] **Step 8: Re-run targeted persistence/runtime tests**

Run:
```bash
pnpm --filter @loomic/server vitest run \
  test/supabase-checkpointer.test.ts \
  test/supabase-store.test.ts \
  test/deep-agent-runtime.test.ts
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/agent/persistence/supabase-checkpointer.ts \
  apps/server/src/agent/persistence/supabase-store.ts \
  apps/server/src/agent/persistence/index.ts \
  apps/server/src/agent/deep-agent.ts \
  apps/server/src/agent/runtime.ts \
  apps/server/src/agent/backends/index.ts \
  apps/server/test/supabase-checkpointer.test.ts \
  apps/server/test/supabase-store.test.ts \
  apps/server/test/deep-agent-runtime.test.ts
git commit -m "feat: persist deepagents threads in supabase"
```

## Task 4: Update Web Session Usage and Run Full Verification

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx`
- Modify: `apps/web/src/components/chat-workbench.tsx`
- Modify: `apps/web/src/lib/server-api.ts`
- Test: `apps/web/test/chat-workbench.test.tsx`
- Test: `apps/web/test/server-api.test.ts`
- Optionally modify related web tests if session semantics require it

- [ ] **Step 1: Write failing web tests**

Add failing assertions that:
- the active session id is used when creating runs
- the client no longer fabricates `session-${canvasId}` for runtime calls
- current transcript persistence behavior remains unchanged

- [ ] **Step 2: Run targeted web tests to verify RED**

Run:
```bash
pnpm --filter @loomic/web vitest run \
  test/chat-workbench.test.tsx \
  test/server-api.test.ts
```
Expected: FAIL on session id expectations

- [ ] **Step 3: Implement web session/run fixes**

Modify:
- `apps/web/src/components/chat-sidebar.tsx`
- `apps/web/src/components/chat-workbench.tsx`
- `apps/web/src/lib/server-api.ts`

So the client:
- uses the actual active session id for run creation
- keeps `conversationId` semantics stable only where still needed by shared contract
- does not leak persistence internals into the UI

- [ ] **Step 4: Re-run targeted web tests**

Run:
```bash
pnpm --filter @loomic/web vitest run \
  test/chat-workbench.test.tsx \
  test/server-api.test.ts
```
Expected: PASS

- [ ] **Step 5: Run full project verification**

Run:
```bash
pnpm test
pnpm typecheck
pnpm lint
```
Expected:
- all tests pass
- all typechecks pass
- lint exits clean

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx \
  apps/web/src/components/chat-workbench.tsx \
  apps/web/src/lib/server-api.ts \
  apps/web/test/chat-workbench.test.tsx \
  apps/web/test/server-api.test.ts
git commit -m "feat: use persisted session threads in web chat"
```

## Execution Notes

- Old sessions are out of scope. Do not add transcript replay fallback for them.
- Legacy rows may keep `thread_id = null`; new sessions must never do so.
- Prefer framework-aligned persistence contracts over Loomic-specific abstractions wherever possible.
- Keep checkpoint/store internals server-only.
- Follow TDD strictly: no production code before a failing test is observed.
- Keep files focused; if a new adapter grows unexpectedly, stop and report instead of improvising a larger redesign.

## Subagent Execution Choice

User already chose: **Subagent-Driven (recommended)**.

Next step: execute this plan with `superpowers:subagent-driven-development`.
