# Desktop App Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real macOS packaging flow that turns the Loomic desktop shell into a distributable `.app` and `.dmg`.

**Architecture:** Keep `apps/desktop` as the Electron app boundary. Build `main` and `preload` into `dist/`, export the Next.js renderer into `apps/web/out`, then use `electron-builder` to package the Electron app while copying the renderer into `Contents/Resources/web`.

**Tech Stack:** Electron, electron-builder, esbuild, Next.js static export, pnpm, Vitest

---

### Task 1: Verify packaging config behavior with tests

**Files:**
- Create: `apps/desktop/src/builder-config.ts`
- Create: `apps/desktop/test/builder-config.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that asserts the builder config:
- uses `dist/main.js` as the packaged entry
- copies `../web/out` into `Resources/web`
- writes packaged artifacts to `apps/desktop/release`
- targets macOS `dir` and `dmg`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @loomic/desktop test -- apps/desktop/test/builder-config.test.ts`
Expected: FAIL because the builder config module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create a focused config module that exports the `electron-builder` configuration object and any tiny helpers needed for script usage.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @loomic/desktop test -- apps/desktop/test/builder-config.test.ts`
Expected: PASS

### Task 2: Add electron-builder packaging scripts

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/scripts/package.mjs`

- [ ] **Step 1: Add packaging commands**

Add scripts for:
- renderer export
- desktop build
- mac packaging

- [ ] **Step 2: Implement package script**

Use `electron-builder` programmatically so the config stays in TypeScript-friendly local code instead of opaque JSON/YAML.

- [ ] **Step 3: Verify build pipeline**

Run: `pnpm --filter @loomic/desktop build`
Expected: PASS and refresh `dist/main.js` / `dist/preload.js`

### Task 3: Ignore packaging artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ignore release artifacts**

Ignore:
- `apps/desktop/release/`
- `*.app`
- `*.dmg`

- [ ] **Step 2: Re-check git status**

Run: `git status --short`
Expected: no packaged binaries appear as untracked files

### Task 4: Produce and verify a macOS package

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/url.ts` only if packaging verification reveals a real path issue

- [ ] **Step 1: Run the mac packaging command**

Run: `pnpm --filter @loomic/desktop package:mac`
Expected: PASS and generate a `.app` inside `apps/desktop/release`

- [ ] **Step 2: Verify tests and types**

Run:
- `pnpm --filter @loomic/desktop test`
- `pnpm --filter @loomic/desktop typecheck`

Expected: PASS

- [ ] **Step 3: Inspect output directory**

Run: `find apps/desktop/release -maxdepth 3 -type f | sort`
Expected: packaged desktop artifacts including a macOS `.app` bundle or `.dmg`
