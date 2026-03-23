# Loomic Phase A Deep Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Loomic's mock server run path with a real JavaScript Deep Agents runtime that streams text and one real tool lifecycle through the existing SSE contract, while keeping Web and Desktop clients stable.

**Architecture:** `apps/server` remains the only runtime boundary. A single `createDeepAgent` supervisor-style runtime will replace the mock store for Phase A, with one safe tool and a backend policy that differs between development and production. The server will adapt deep agent streaming onto the existing Loomic SSE contract so `apps/web` and `apps/desktop` do not need a contract rewrite.

**Tech Stack:** `TypeScript`, `Node.js`, `Fastify`, `deepagents`, `LangChain 1.x`, `SSE`, `zod`, `vitest`, `Next.js`, `Electron`, `CompositeBackend`, `StateBackend`, `FilesystemBackend`.

---

### Task 1: Prepare Phase A server dependencies, env contracts, and event extensions

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/package.json`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/config/env.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/packages/shared/src/events.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/packages/shared/src/contracts.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/phase-a-env.test.ts`

- [ ] **Step 1: Write the failing env and event tests**

Add tests that assert:
- the server env loader exposes explicit Phase A model/backend settings
- shared stream events still validate `run.started`, `message.delta`, `tool.started`, `tool.completed`, `run.completed`, and `run.failed`
- no client-facing event rename is required for Phase A

- [ ] **Step 2: Run the targeted tests and confirm the Phase A config surface is missing**

Run: `pnpm --filter @loomic/server test -- phase-a-env.test.ts`
Expected: FAIL because the new env contract and any required event refinements do not exist yet.

- [ ] **Step 3: Add the minimal dependency and env surface**

Update `apps/server/package.json` to add the latest Phase A runtime packages:
- `deepagents`
- `@langchain/openai`
- any minimal LangChain peer/runtime packages required by the docs

Extend `src/config/env.ts` with Phase A settings such as:
- `LOOMIC_AGENT_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `LOOMIC_AGENT_BACKEND_MODE`
- `LOOMIC_AGENT_FILES_ROOT`

Keep defaults safe:
- default backend mode should not expose unrestricted host shell execution
- explicit local filesystem access must require an intentional dev-oriented setting

- [ ] **Step 4: Re-run env and shared tests**

Run:
- `pnpm --filter @loomic/shared test`
- `pnpm --filter @loomic/server test -- phase-a-env.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/package.json /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/config/env.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/phase-a-env.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/packages/shared/src/events.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/packages/shared/src/contracts.test.ts
git commit -m "chore: define phase-a deep-agent runtime contracts"
```

### Task 2: Add backend factories and one safe real tool

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/backends/index.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/backends/dev.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/backends/prod.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/tools/project-search.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/tools/index.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/backends.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/project-search.test.ts`

- [ ] **Step 1: Write the failing backend and tool tests**

Cover:
- development backend can resolve a controlled filesystem backend when explicitly enabled
- production backend resolves to a constrained non-host-shell shape
- the first real tool can search a known workspace sample and return a summarized result

- [ ] **Step 2: Run the new tests and confirm the backend/tool layer is absent**

Run:
- `pnpm --filter @loomic/server test -- backends.test.ts`
- `pnpm --filter @loomic/server test -- project-search.test.ts`

Expected: FAIL because no backend factories or real tools exist yet.

- [ ] **Step 3: Implement backend factories and the first safe tool**

Implement:
- a backend factory entrypoint that chooses dev or production behavior from env
- dev mode using `FilesystemBackend` only when the root path is explicitly configured
- production mode using a constrained `CompositeBackend` / `StateBackend` style setup with durable routes reserved but not yet bound to Supabase
- a first tool such as `project_search` that uses the backend-visible workspace surface rather than ad hoc host shell access

Keep the tool narrow:
- read-only
- no shell execution
- deterministic summary output suitable for `tool.completed`

- [ ] **Step 4: Re-run backend and tool tests**

Run: `pnpm --filter @loomic/server test -- backends.test.ts project-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/backends /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/tools /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/backends.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/project-search.test.ts
git commit -m "feat: add phase-a backends and project search tool"
```

### Task 3: Replace the mock run store with a Deep Agents runtime adapter

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/deep-agent.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/runtime.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent/stream-adapter.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/app.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/http/runs.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/http/sse.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/deep-agent-runtime.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/stream-adapter.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

Add tests that prove:
- `POST /api/agent/runs` now starts a real runtime-backed run instead of a mock store entry
- the runtime streams text deltas as `message.delta`
- the first real tool surfaces `tool.started` and `tool.completed`
- cancellation still ends the active run cleanly
- `run.failed` is emitted when the runtime raises

- [ ] **Step 2: Run the runtime tests and confirm the mock implementation still blocks them**

Run:
- `pnpm --filter @loomic/server test -- deep-agent-runtime.test.ts`
- `pnpm --filter @loomic/server test -- stream-adapter.test.ts`

Expected: FAIL because the server still uses `createMockRunStore`.

- [ ] **Step 3: Implement the deep agent runtime and SSE bridge**

Implement:
- a `createDeepAgent` factory that uses the configured model, backend, and tool list
- a runtime service that tracks active runs and abort controllers
- a stream adapter that maps deep agent streaming updates onto the existing Loomic events

Preserve the public contract:
- `run.started`
- `message.delta`
- `tool.started`
- `tool.completed`
- `run.completed`
- `run.failed`

Do not add a Web/Desktop contract rewrite in this task.

- [ ] **Step 4: Re-run the server runtime tests and manual API smoke check**

Run: `pnpm --filter @loomic/server test`
Expected: PASS.

Run:
```bash
pnpm --filter @loomic/server dev
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/agent/runs -H 'content-type: application/json' -d '{"sessionId":"session_demo","conversationId":"conversation_demo","prompt":"Search the workspace for Loomic foundation docs"}'
```

Expected:
- health returns `ok: true`
- run creation returns `202`
- SSE stream shows real text/tool events instead of the previous mock-only message

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/agent /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/app.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/http/runs.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/src/http/sse.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/deep-agent-runtime.test.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/server/test/stream-adapter.test.ts
git commit -m "feat: add phase-a deep-agent runtime"
```

### Task 4: Prove the existing Web/Desktop clients still work without a contract rewrite

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/web/test/chat-workbench.test.tsx`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/web/src/components/chat-workbench.tsx`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/desktop/test/url.test.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-foundation-status.md`

- [ ] **Step 1: Extend the failing client tests**

Update tests to prove:
- the web workbench still renders incremental text deltas
- tool lifecycle events from the real runtime appear without any client-side contract rewrite
- desktop production path validation still targets `apps/web/out/index.html`

- [ ] **Step 2: Run the client tests and confirm any mismatches**

Run:
- `pnpm --filter @loomic/web test`
- `pnpm --filter @loomic/desktop test`

Expected: FAIL if the real runtime emits shapes that the current UI no longer handles cleanly.

- [ ] **Step 3: Make the smallest client updates necessary**

Only adjust the clients if needed to keep rendering correct. Do not add new product flows. The target is compatibility, not expansion.

- [ ] **Step 4: Re-run client verification plus repo-wide quality gates**

Run:
- `pnpm --filter @loomic/web test`
- `pnpm --filter @loomic/desktop test`
- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/web /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/apps/desktop /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-foundation-status.md
git commit -m "feat: verify phase-a deep-agent client compatibility"
```

### Task 5: Real-model validation and Phase A handoff

**Files:**
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-foundation-status.md`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-phase-a-validation.md`

- [ ] **Step 1: Run one local fake-model verification and one real-model verification**

Fake-model verification should remain the default automated path in tests.

Real-model verification should use the approved local environment variables without committing secrets:
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`

- [ ] **Step 2: Execute the real-model smoke run**

Run:
```bash
pnpm --filter @loomic/server dev
pnpm --filter @loomic/web dev
```

Then start one real run through the workbench with a prompt that should trigger the first real tool.

Expected:
- the model answers through SSE
- the tool is visibly invoked
- the run completes or fails with a structured error event

- [ ] **Step 3: Record validation notes and known limits**

Write down:
- what passed automatically
- what was validated against a real model endpoint
- any remaining limitations, especially that Supabase persistence is not part of this phase yet

- [ ] **Step 4: Re-run final repo-wide verification**

Run:
- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-foundation-status.md /Users/nowcoder/Desktop/auto-code-work/Loomic/.worktrees/loomic-foundation/docs/superpowers/progress/2026-03-23-loomic-phase-a-validation.md
git commit -m "docs: record phase-a deep-agent validation"
```
