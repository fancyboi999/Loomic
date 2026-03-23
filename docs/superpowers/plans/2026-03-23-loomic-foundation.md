# Loomic Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Loomic monorepo foundation for Phase D and the chat-agent slice of Phase A: web, desktop, and server run independently, share one contract layer, and support a streamed chat run with one example tool and cancellation.

**Architecture:** Keep the server as the only orchestration/runtime boundary, keep `packages/shared` as the source of truth for all cross-app contracts, and keep `apps/desktop` as a thin Electron shell that loads the web app. Phase D uses a mock run path with SSE so the client contract is proven early; Phase A swaps that mock path for a real LangGraph JS agent skeleton and a small tool registry without expanding into canvas or generation workflows.

**Tech Stack:** `TypeScript`, `pnpm`, `turbo`, `Next.js`, `Electron`, `Node.js`, `Fastify`, `LangGraph JS`, `SSE`, `zod`, `vitest`.

---

### Task 1: Establish the monorepo foundation and workspace contracts

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/pnpm-workspace.yaml`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/turbo.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/tsconfig.base.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/vitest.workspace.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/tests/workspace.test.mjs`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/config/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/config/tsconfig.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/config/src/index.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/ui/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/ui/tsconfig.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/ui/src/index.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/tsconfig.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/tsconfig.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/tsconfig.json`

- [ ] **Step 1: Write the failing workspace verification tests**

Create a tiny repo-level smoke test in `tests/workspace.test.mjs` that checks the workspace metadata is wired for the expected packages and scripts. Assert that the root manifest exposes `dev`, `build`, and `test`, and that the workspace includes both `apps/*` and `packages/*`.

- [ ] **Step 2: Run the smoke test and confirm the repo is not yet wired**

Run: `node --test tests/workspace.test.mjs`
Expected: FAIL because the workspace manifests and root scripts do not exist yet.

- [ ] **Step 3: Add the minimal monorepo manifests and base TS config**

Implement the root workspace, Turbo pipeline, shared TypeScript base config, root Vitest workspace, and placeholder `packages/ui` package. Keep package naming consistent across the repo: `@loomic/web`, `@loomic/server`, `@loomic/desktop`, `@loomic/shared`, `@loomic/ui`, `@loomic/config`.

- [ ] **Step 4: Run the workspace checks again**

Run: `node --test tests/workspace.test.mjs` then `pnpm install` then `pnpm turbo run build --filter=@loomic/config`
Expected: PASS and the workspace should resolve all package roots without path errors.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/package.json /Users/nowcoder/Desktop/auto-code-work/Loomic/pnpm-workspace.yaml /Users/nowcoder/Desktop/auto-code-work/Loomic/turbo.json /Users/nowcoder/Desktop/auto-code-work/Loomic/tsconfig.base.json /Users/nowcoder/Desktop/auto-code-work/Loomic/vitest.workspace.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/tests/workspace.test.mjs /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/config /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/ui /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop
git commit -m "chore: scaffold loomic monorepo"
```

### Task 2: Define the shared contract package for runs, stream events, and errors

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/package.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/tsconfig.json`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/index.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/events.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/errors.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/http.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared/src/contracts.test.ts`

- [ ] **Step 1: Write the failing contract tests first**

Add tests that assert:
- `GET /api/health` response schema is shared and importable by server and web
- run creation input/output schemas accept `sessionId` and `conversationId`
- `POST /api/agent/runs/:runId/cancel` response schema is shared and stable
- the stream event union includes `run.started`, `message.delta`, `tool.started`, `tool.completed`, `run.completed`, and `run.failed`
- stable error codes serialize as plain JSON and can be imported by both server and web

- [ ] **Step 2: Run the contract tests and verify they fail**

Run: `pnpm --filter @loomic/shared test -- contracts.test.ts`
Expected: FAIL because the shared package and schemas are not implemented yet.

- [ ] **Step 3: Implement the shared zod schemas and exported types**

Keep the package implementation-only: no app-specific logic, no transport code, and no direct runtime dependencies on Next.js or Electron.

The first shared HTTP contract surface must include:
- `GET /api/health` response
- `POST /api/agent/runs` request/response
- `POST /api/agent/runs/:runId/cancel` response
- SSE event payload types used by `GET /api/agent/runs/:runId/events`

- [ ] **Step 4: Re-run the contract tests**

Run: `pnpm --filter @loomic/shared test`
Expected: PASS and the exported types should compile from server and client entry points.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared
git commit -m "feat: add shared loomic contracts"
```

### Task 3: Build the server health endpoint and mock SSE run path

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/server.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/app.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/config/env.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/health.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/runs.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/sse.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/mock/mock-run.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/health.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/mock-runs.test.ts`

- [ ] **Step 1: Write server tests for health and mocked run streaming**

Cover these cases in tests:
- `GET /api/health` returns liveness metadata and build/version info
- `POST /api/agent/runs` creates a run record and returns a `runId`
- `GET /api/agent/runs/:runId/events` streams SSE frames from the mock run
- `POST /api/agent/runs/:runId/cancel` marks the run canceled and stops further mock events
- browser-origin requests from the Web app are allowed by explicit CORS configuration during development

- [ ] **Step 2: Run the server tests and confirm the HTTP layer is still missing**

Run: `pnpm --filter @loomic/server test -- health.test.ts mock-runs.test.ts`
Expected: FAIL because the Fastify app, handlers, and mock SSE path do not exist yet.

- [ ] **Step 3: Implement the Fastify app with the mock SSE pipeline**

Use `Fastify` for the standalone Node service, keep the mock run implementation isolated from the eventual LangGraph runner, and make the SSE writer reuse the shared event contract from `packages/shared`.

Also define the first explicit runtime contract for direct Web-to-Server communication:
- default server port: `3001`
- default allowed web origin in dev: `http://localhost:3000`
- env override: `LOOMIC_SERVER_PORT`, `LOOMIC_WEB_ORIGIN`
- CORS must allow the web origin used by `apps/web` and reject unrelated defaults
- packaged Desktop requests must also work when the rendered app is loaded from a static export with `file://` semantics; treat `null`/missing origin from the local desktop runtime as allowed only for loopback access to the local Loomic server
- cancel responses must reuse a shared contract shape, not ad hoc JSON

- [ ] **Step 4: Re-run the server tests and a manual health check**

Run: `pnpm --filter @loomic/server test`
Expected: PASS.

Run: `pnpm --filter @loomic/server dev` then `curl http://localhost:3001/api/health`
Expected: JSON health response with `ok: true` and version metadata.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server
git commit -m "feat: add server health and mock sse runs"
```

### Task 4: Build the web minimal workbench that talks directly to the server

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/layout.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/app/page.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/next.config.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/components/chat-workbench.tsx`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/env.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/server-api.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/src/lib/stream-events.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web/test/chat-workbench.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

Add tests that assert:
- the page renders a minimal chat workbench with a message composer and a streamed event log
- the client calls the server endpoints directly, not a Next.js BFF route
- the client resolves the server base URL from one explicit config source such as `NEXT_PUBLIC_SERVER_BASE_URL`
- incoming SSE events update the UI incrementally

- [ ] **Step 2: Run the web tests and verify the UI shell is not implemented yet**

Run: `pnpm --filter @loomic/web test -- chat-workbench.test.tsx`
Expected: FAIL because the page, client helper, and streaming UI are missing.

- [ ] **Step 3: Implement the web page, event parser, and direct server client**

Keep the web app intentionally small: one screen, one run input, one stream output, and no canvas or generation workflows. The only product API here is the server contract from `packages/shared`.

Hard requirements for this task:
- use a single explicit server base URL config, defaulting to `http://localhost:3001`
- do not add a Next.js API proxy or BFF route
- keep SSE consumption in one reusable helper so Desktop and Web behavior stay aligned through the same client code
- configure the web app for a production artifact that Desktop can consume, using static export output for this phase unless a later requirement forces a server-rendered entrypoint

- [ ] **Step 4: Re-run the web tests and a browser smoke check**

Run: `pnpm --filter @loomic/web test`
Expected: PASS.

Run: `pnpm --filter @loomic/web dev`
Expected: The workbench loads, can start a run, and shows streamed mock events from the server.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web
git commit -m "feat: add minimal loomic web workbench"
```

### Task 5: Make Electron a thin desktop shell that loads the web app

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/src/main.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/src/preload.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/src/runtime.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/src/url.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop/test/url.test.ts`

- [ ] **Step 1: Write the thin-shell tests**

Cover these behaviors:
- in development, the desktop app resolves the web URL from `WEB_URL` or the default local Next.js dev server
- in production, the shell resolves the packaged web entrypoint from the static export output produced by `apps/web`
- the preload bridge exposes only the minimal native surface needed for this phase

- [ ] **Step 2: Run the desktop tests and verify the shell helpers are missing**

Run: `pnpm --filter @loomic/desktop test -- url.test.ts`
Expected: FAIL because the URL resolver and Electron bootstrap are not implemented yet.

- [ ] **Step 3: Implement the Electron main process and preload bridge**

Keep the desktop process thin. It should only create the window, load the web app, and expose the smallest stable bridge required for Phase D and Phase A.

Production build rule for this task:
- `apps/web` must produce a static export artifact for Desktop, with a stable output path such as `apps/web/out`
- `apps/desktop` production loading must resolve that exported `index.html`, not a dev server URL
- the desktop build script must depend on the web build/export step so `pnpm turbo run build` validates the production path instead of only dev loading
- desktop-to-server production connectivity must be validated against the intended local origin model: packaged renderer loaded from the exported app, requests sent to the local server on loopback, and no reliance on a Next.js proxy

- [ ] **Step 4: Re-run the desktop tests and manual load check**

Run: `pnpm --filter @loomic/desktop test`
Expected: PASS.

Run: `pnpm --filter @loomic/desktop dev`
Expected: Electron opens and loads the web workbench from the local web app URL.

Run: `pnpm --filter @loomic/web build` then `pnpm --filter @loomic/desktop build`
Expected: the desktop build resolves the exported web entrypoint without missing-file errors.

Run: launch the packaged or production-mode desktop build against the local server
Expected: the exported renderer can still reach `http://127.0.0.1:3001` or equivalent loopback server endpoint and start a run without origin/CORS failures.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop
git commit -m "feat: add electron web loader"
```

### Task 6: Replace the mock run with a real LangGraph JS agent skeleton, tool registry, one example tool, and cancellation

**Files:**
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/agent/graph.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/agent/runtime.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/agent/cancel.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/tools/registry.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/tools/example-tool.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/tools/tool-types.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/http/runs.ts`
- Modify: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/src/mock/mock-run.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/tool-registry.test.ts`
- Create: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server/test/agent-runtime.test.ts`

- [ ] **Step 1: Write failing tests for the registry and cancellation path**

Add tests that assert:
- the tool registry exposes exactly one example tool for this phase
- the LangGraph agent skeleton can resolve tool metadata from the registry
- canceling a run aborts the active stream and returns a stable canceled response
- the mock run path is no longer the default once the real agent runtime is wired in

- [ ] **Step 2: Run the agent and tool tests and confirm they fail**

Run: `pnpm --filter @loomic/server test -- tool-registry.test.ts agent-runtime.test.ts`
Expected: FAIL because the LangGraph agent runtime, registry, and cancel plumbing do not exist yet.

- [ ] **Step 3: Implement the LangGraph skeleton and tool adapter layer**

Build the smallest real agent path that is still production-shaped:
- create a graph entrypoint that accepts the shared run contract
- stream message deltas through SSE
- invoke the tool registry through an adapter, not directly from route handlers
- wire cancel to the active run via `AbortController` or the equivalent runtime cancellation mechanism
- keep tests deterministic by using a fake local chat model or stubbed graph node in automated tests; real provider credentials must remain optional for smoke runs

- [ ] **Step 4: Re-run the server tests and one end-to-end stream check**

Run: `pnpm --filter @loomic/server test`
Expected: PASS.

Run: `pnpm --filter @loomic/server dev` then create a run from the web UI
Expected: the example tool can be invoked through the new registry and cancel stops the active run cleanly.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server
git commit -m "feat: wire langgraph agent skeleton and tools"
```

### Task 7: Run the foundation validation matrix and capture Phase D/A readiness

**Files:**
- Test: `/Users/nowcoder/Desktop/auto-code-work/Loomic/package.json`
- Test: `/Users/nowcoder/Desktop/auto-code-work/Loomic/packages/shared`
- Test: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server`
- Test: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web`
- Test: `/Users/nowcoder/Desktop/auto-code-work/Loomic/apps/desktop`

- [ ] **Step 1: Run repo-wide type and test checks**

Run:
```bash
pnpm turbo run test
pnpm turbo run typecheck
pnpm turbo run build
```
Expected: PASS across all workspace packages and apps.

- [ ] **Step 2: Run the minimum product smoke sequence**

Run:
```bash
pnpm --filter @loomic/server dev
```
Then in separate terminals:
```bash
pnpm --filter @loomic/web dev
WEB_URL=http://localhost:3000 pnpm --filter @loomic/desktop dev
```
Expected:
- server serves `/api/health`
- web starts a chat run and receives SSE updates
- desktop loads the web app and reflects the same streamed run state

Port/env coordination for the smoke:
- `apps/web` runs on `3000`
- `apps/server` runs on `3001`
- `apps/web` uses `NEXT_PUBLIC_SERVER_BASE_URL=http://localhost:3001`
- `apps/desktop` uses `WEB_URL=http://localhost:3000`

- [ ] **Step 3: Confirm scope stays inside Phase D and the chat/tool slice of Phase A**

Verify that no canvas paths, image-generation workflows, or extra product surfaces were added before the chat foundation is stable.

- [ ] **Step 4: Record the final validation result**

Expected: Phase D foundation is complete, Phase A chat/tooling entry is ready, and all runtime boundaries remain aligned with `packages/shared`.

- [ ] **Step 5: Commit**

```bash
git add /Users/nowcoder/Desktop/auto-code-work/Loomic/apps /Users/nowcoder/Desktop/auto-code-work/Loomic/packages /Users/nowcoder/Desktop/auto-code-work/Loomic/package.json /Users/nowcoder/Desktop/auto-code-work/Loomic/pnpm-workspace.yaml /Users/nowcoder/Desktop/auto-code-work/Loomic/turbo.json /Users/nowcoder/Desktop/auto-code-work/Loomic/tsconfig.base.json /Users/nowcoder/Desktop/auto-code-work/Loomic/vitest.workspace.ts /Users/nowcoder/Desktop/auto-code-work/Loomic/tests
git commit -m "feat: complete loomic foundation slice"
```
