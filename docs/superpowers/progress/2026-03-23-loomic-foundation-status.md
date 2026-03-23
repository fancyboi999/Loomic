# Loomic Foundation Status

Date: `2026-03-23`
Branch: `feat/loomic-foundation`

## Scope

This progress note records the implementation status for Phase `D`, following:

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
- Server foundation exists in `apps/server` with:
  - `/api/health`
  - mock run creation
  - mock cancellation
  - SSE event streaming
- Web foundation exists in `apps/web` with:
  - Next.js app router setup
  - minimal chat workbench page
  - direct server calls
  - streamed event rendering
  - static export support for desktop consumption
- Desktop foundation exists in `apps/desktop` with:
  - Electron thin shell
  - development URL loading
  - production file loading from `apps/web/out`
  - preload bridge exposing minimal runtime metadata
- Build orchestration now enforces `@loomic/web#build` before `@loomic/desktop#build` to avoid concurrent writes to `.next`.

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

## Current Residual Risks

- `apps/web/out` is currently treated as a production artifact for the Electron shell. That is acceptable for Phase `D`, but later packaging should decide whether this remains committed or becomes a generated-only artifact.
- Electron GUI smoke verification is still limited by local Electron binary setup and host environment constraints, even though desktop tests and production path validation pass.
- Phase `A` has not started yet. The server still emits mock runs rather than a real LangGraph agent runtime.

## Next

- Commit the finished Phase `D` implementation.
- Start Phase `A` with a real LangGraph JS agent runtime.
- Replace the mock SSE pipeline with real streamed model output and at least one tool path.
