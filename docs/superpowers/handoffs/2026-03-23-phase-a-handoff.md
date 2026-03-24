# Loomic Phase A Handoff

Date: `2026-03-23`
Audience: next agent continuing Loomic development

## Canonical Git State

- GitHub repo: `git@github.com:fancyboi999/Loomic.git`
- PR: `#1`
- PR URL: `https://github.com/fancyboi999/Loomic/pull/1`
- PR status: `MERGED`
- Merge commit on GitHub `main`: `8231e74`

Important:

- The canonical remote state is GitHub `main` after PR `#1`.
- The local main worktree may not yet be synced to that merge commit.
- Before continuing feature work, prefer starting from a clean branch based on the latest remote `main`.

## What Was Completed

Phase `D` and the minimum usable Phase `A` path are in place.

Implemented:

- monorepo foundation with `pnpm` + `turbo` + `TypeScript` + `Biome`
- `apps/web` Next.js workbench
- `apps/desktop` Electron thin shell
- `apps/server` Node/Fastify runtime
- `packages/shared` contracts for:
  - health
  - run creation
  - run cancellation
  - SSE events
  - stable error payloads
- Phase `A` Deep Agents runtime
- first real tool: `project_search`
- real provider smoke validation through the approved OpenAI-compatible gateway

## Critical Runtime Decision

Do not switch server streaming back to `["messages", "updates"]`.

Reason:

- Under real provider runs with tools enabled, Deep Agents streaming failed with:
  - `patchToolCallsMiddleware: expected AIMessage or Command, got object`
- This failure reproduced outside Loomic in a minimal Deep Agents streaming repro.
- `invoke()` worked.
- `stream()` worked when using `["updates", "tools"]`.

Current server behavior therefore intentionally uses:

- `streamMode: ["updates", "tools"]`

And adapts that into Loomic SSE:

- `run.started`
- `tool.started`
- `tool.completed`
- `message.delta`
- `run.completed`

## Files To Read First

- `docs/superpowers/specs/2026-03-23-loomic-foundation-design.md`
- `docs/superpowers/plans/2026-03-23-loomic-foundation.md`
- `docs/superpowers/progress/2026-03-23-loomic-foundation-status.md`
- `apps/server/src/agent/deep-agent.ts`
- `apps/server/src/agent/runtime.ts`
- `apps/server/src/agent/stream-adapter.ts`
- `apps/server/src/agent/tools/project-search.ts`
- `apps/web/src/components/chat-workbench.tsx`

## Environment Contract

Do not commit real secret values.

Current runtime expects these env vars:

- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `REPLICATE_API_TOKEN`
- `LOOMIC_AGENT_MODEL`
- optional dev-only backend vars:
  - `LOOMIC_AGENT_BACKEND_MODE`
  - `LOOMIC_AGENT_FILES_ROOT`

OpenAI-compatible routing currently maps:

- `OPENAI_API_BASE` -> runtime `OPENAI_BASE_URL`
- default provider-scoped model format -> `openai:<route-model>`

Example semantic model form:

- `openai:az_sre/gpt-5.4`

## Verification Already Passing

Repository-level verification passed on the feature worktree before merge:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Real provider smoke also passed with:

```bash
OPENAI_API_BASE=...
OPENAI_API_KEY=...
LOOMIC_AGENT_MODEL=az_sre/gpt-5.4
pnpm --filter @loomic/server dev
```

Observed successful SSE terminal path:

- `run.started`
- tool lifecycle events
- `message.delta`
- `run.completed`

## Known Non-Issues

These were explicitly checked and are not the current problem:

- user-provided API key validity
- user-provided base URL validity
- `az_sre/gpt-5.4` route itself
- plain OpenAI-compatible `chat/completions` connectivity
- minimal `createDeepAgent(...).invoke()`

## Remaining Decisions

Not yet resolved:

- whether `apps/web/out` should remain committed or become generated-only
- whether desktop production should continue depending on checked-in static export artifacts
- when to introduce Supabase-backed persistence

Current choice:

- `apps/web/out` was intentionally not included in the merged PR

## Recommended Next Work

Recommended order:

1. Sync local working repo to the latest GitHub `main`
2. Run local web + server and inspect the UI manually
3. Decide artifact policy for `apps/web/out`
4. Introduce Supabase foundation
5. Expand Phase `A` from one-tool workspace agent to broader task execution

## Suggested Startup Commands

For local development:

```bash
pnpm --filter @loomic/server dev
pnpm --filter @loomic/web dev
```

Open:

```text
http://localhost:3000
```

## Notes For The Next Agent

- Use the merged GitHub `main` as source of truth.
- Keep desktop thin; do not move agent logic into Electron.
- Keep shared contracts in `packages/shared`; do not leak app-specific state there.
- If you touch streaming again, reproduce with a minimal Deep Agents script before changing Loomic code.
- No secrets were committed, but exposed credentials in chat history should still be rotated by the human owner.
