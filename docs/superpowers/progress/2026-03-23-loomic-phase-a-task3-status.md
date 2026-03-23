# Loomic Phase A Task 3 Status

Date: 2026-03-23
Scope: Replace the mock run store with a real Deep Agents runtime while preserving Loomic's Phase A SSE contract.

## Delivered

- Added a Deep Agents-backed runtime in `apps/server/src/agent/runtime.ts`.
- Added `apps/server/src/agent/deep-agent.ts` to construct the Phase A Loomic agent with the current backend factory and `project_search` tool.
- Added `apps/server/src/agent/stream-adapter.ts` to translate Deep Agents stream chunks into Loomic SSE events:
  - `run.started`
  - `message.delta`
  - `tool.started`
  - `tool.completed`
  - `run.canceled`
  - `run.completed`
  - `run.failed`
- Updated the HTTP run and SSE routes to use the runtime service instead of the old mock store.
- Expanded server coverage with runtime integration tests and stream adapter tests.
- Migrated the old mock route tests to runtime-backed scripted-model tests so the route contract stays verified without external API calls.

## Validation

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Notes

- Production remains state-backed only for Phase A.
- Development can still opt into the filesystem backend via the existing backend factory.
- Real provider validation can now plug into the runtime without changing the SSE contract consumed by web or desktop.
