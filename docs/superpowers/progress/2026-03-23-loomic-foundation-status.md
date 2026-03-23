# Loomic Foundation Status

Date: `2026-03-23`
Branch: `feat/loomic-foundation`

## Scope

This progress note records the implementation status for the Loomic foundation and the first completed Phase `A` compatibility milestones, following:

- `docs/superpowers/specs/2026-03-23-loomic-foundation-design.md`
- `docs/superpowers/plans/2026-03-23-loomic-foundation.md`

## Completed

- Monorepo foundation is in place with `pnpm`, `turbo`, `TypeScript`, and `Biome`.
- Shared contracts exist in `packages/shared` for:
  - health responses
  - run creation
  - run cancellation
  - streamed SSE events
  - stable error codes
- Server runtime exists in `apps/server` with:
  - `/api/health`
  - runtime-backed run creation
  - runtime-backed cancellation
  - Deep Agents SSE event streaming
  - one observable `project_search` tool path
- Web foundation exists in `apps/web` with:
  - Next.js app router setup
  - runtime-compatible chat workbench page
  - direct server calls
  - incremental assistant delta rendering
  - explicit tool activity rendering
  - distinct canceled vs failed terminal states
  - static export support for desktop consumption
- Desktop foundation exists in `apps/desktop` with:
  - Electron thin shell
  - development URL loading
  - production file loading from `apps/web/out`
  - preload bridge exposing minimal runtime metadata
- Build orchestration now enforces `@loomic/web#build` before `@loomic/desktop#build` to avoid concurrent writes to `.next`.
- Phase `A` real-provider validation now passes against the approved OpenAI-compatible gateway using `az_sre/gpt-5.4`.
- Server streaming now uses Deep Agents `["updates", "tools"]` mode instead of `["messages", "updates"]`.
  - This was required because the latter combination reliably failed during real runs with `patchToolCallsMiddleware: expected AIMessage or Command, got object`.
  - The replacement mode still provides:
    - tool start events
    - tool completion events
    - final assistant message emission
    - stable `run.completed` termination

## Verification

The current branch passed the repository-level verification chain:

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

Additional web-specific verification passed:

```bash
pnpm --filter @loomic/web test
pnpm --filter @loomic/web typecheck
pnpm --filter @loomic/web build
```

Additional Phase `A` compatibility verification passed:

```bash
pnpm --filter @loomic/server test
pnpm --filter @loomic/web test
pnpm --filter @loomic/desktop test
```

Additional real-provider smoke validation passed:

```bash
OPENAI_API_KEY=... \
OPENAI_API_BASE=https://one-api.nowcoder.com/v1 \
LOOMIC_AGENT_MODEL=az_sre/gpt-5.4 \
pnpm --filter @loomic/server dev

curl http://127.0.0.1:3001/api/health
curl -X POST http://127.0.0.1:3001/api/agent/runs ...
curl -N http://127.0.0.1:3001/api/agent/runs/<runId>/events
```

Observed SSE terminal path:

- `run.started`
- multiple `tool.started`
- multiple `tool.completed`
- `message.delta`
- `run.completed`

## Current Residual Risks

- `apps/web/out` is currently treated as a production artifact for the Electron shell. That is acceptable for Phase `D`, but later packaging should decide whether this remains committed or becomes a generated-only artifact.
- Electron GUI smoke verification is still limited by local Electron binary setup and host environment constraints, even though desktop tests and production path validation pass.
- `apps/web/out` is still a tracked production artifact, so repo-wide `build` mutates generated files during verification.
- Deep Agents `["messages", "updates"]` streaming still appears incompatible with this agent/tool stack under real provider runs. Loomic is now intentionally pinned to `["updates", "tools"]` until upstream behavior is clarified.

## Next

- Decide whether `apps/web/out` remains committed or becomes a generated-only artifact.
- Prepare the first pushable Phase `A` branch snapshot.
