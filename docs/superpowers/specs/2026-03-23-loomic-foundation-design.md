# Loomic Foundation Design

> **Status:** Approved design baseline for Loomic foundation work. This document defines the architecture and scope that the implementation plan must follow.

**Goal:** Rebuild Jaaz into a new product brand, Loomic, with a monorepo foundation that supports both Web and Desktop clients, while preserving existing product behavior through a gradual migration path.

**Architecture:** Loomic will use a `pnpm` + `turbo` monorepo with `Next.js` for Web, `Electron` as a thin desktop shell, and a standalone `Node.js` server that hosts LangGraph JS and the app's agent runtime. Shared contracts will live in `packages/shared` so Web, Desktop, and Server all speak the same event and API language. Migration is staged: first establish the foundation (`D`), then move the chat agent and tool-calling path (`A`), before expanding into the rest of the product surface.

**Tech Stack:** `TypeScript`, `Next.js`, `Electron`, `Node.js`, `LangGraph JS`, `pnpm`, `turbo`, `zod`, `vitest`, `Fastify`, `SSE` first, `WebSocket` later if needed.

---

## Context

The current Jaaz codebase is a Python-backed desktop application with a React frontend and a FastAPI/Socket.IO server. Loomic is a deliberate rebrand and re-platforming effort, not a cosmetic rename. The core requirement is to preserve product capability while reducing architectural coupling and moving to a single-language JavaScript/TypeScript stack.

LangGraph JS is the orchestration runtime for the new server. The design follows the LangGraph JS model of stateful, long-running orchestration with streaming, durability, and human-in-the-loop support. Streaming should be first-class in the architecture, because the user-facing experience depends on progressive output rather than waiting for a final response.

The official LangGraph JS documentation is the authority for implementation details. In particular, Loomic's server design should continue to align with the capabilities highlighted in the LangGraph overview and production guidance: long-running stateful agents, streaming, interrupts, persistence, and explicit application structure rather than framework-driven hidden control flow.

## Non-Goals

- Recreating every Jaaz implementation detail one-to-one.
- Embedding all backend logic inside Next.js route handlers.
- Keeping the Python backend as the long-term execution layer.
- Optimizing for SEO or marketing site concerns before the product runtime is stable.
- Reworking unrelated product areas before the agent/chat foundation is ready.

## Proposed Repository Layout

- `apps/web`
  - Next.js app for browser users.
  - Owns routes, UI composition, client-side state, and presentation logic.
- `apps/desktop`
  - Electron shell.
  - Owns window lifecycle, native bridge, local filesystem access, and desktop-only integration.
- `apps/server`
  - Standalone Node.js service.
  - Owns LangGraph graphs, model execution, tool registration, session lifecycle, and streamed events.
- `packages/ui`
  - Shared presentation components with no business state.
- `packages/shared`
  - Shared schema, event contracts, request/response types, and error shapes.
- `packages/config`
  - Shared config for TypeScript, linting, formatting, and other repo-wide conventions.
- `docs/`
  - Architecture notes, migration notes, and implementation specs.

## System Boundaries

The key design rule is that the server owns orchestration and execution, shared packages own contracts, and client apps own rendering and platform-specific glue. This keeps Web and Desktop aligned while preventing business logic from leaking into multiple runtimes.

The desktop app should remain a thin host. It must not duplicate the agent runtime or carry a separate business model. Web and Desktop should consume the same server protocol so feature drift does not become a second migration problem.

Desktop runtime behavior should stay simple:

- In development, `apps/desktop` loads the local `apps/web` dev server URL.
- In production, `apps/desktop` loads the packaged Web build or packaged app entrypoint, but still talks to the same `apps/server` contract.
- Desktop-specific preload and native bridge code must stay isolated from shared UI logic.

## Phase Plan

### Phase D: Foundation

Goals:

- Create the monorepo skeleton and shared build setup.
- Make `apps/web`, `apps/desktop`, and `apps/server` independently runnable.
- Define the shared contracts that the product will build on.
- Wire a minimal mock agent flow end to end.

Acceptance criteria:

- Web starts successfully.
- Desktop starts successfully and loads the Web app.
- Server starts successfully and exposes a health endpoint plus a mock agent endpoint.
- Web and Desktop can call the same server and receive streamed mock events.
- `packages/shared` is used by both client and server code paths.

Routing rule:

- `apps/web` should talk directly to `apps/server` for product APIs during Phase D and Phase A.
- Do not introduce a Next.js BFF layer unless a later auth or deployment requirement forces it.
- This keeps the first migration smaller and avoids duplicating request validation in two server runtimes.

### Phase A: Chat Agent and Tool Calling

Goals:

- Replace the mock run with a real LangGraph JS agent path.
- Introduce a tool registry and tool adapter layer.
- Keep the first production-like interaction focused on chat and tool execution.

Preferred transport:

- Use `SSE` for the first streaming implementation.
- Add `WebSocket` only when a later feature truly needs bidirectional realtime behavior.

Why `SSE` first:

- Chat streaming is primarily server-to-client.
- It is simpler to implement and debug than a full duplex channel.
- It keeps the initial contract smaller while still matching the user experience requirement.

## Shared Contracts

`packages/shared` should define the product language, not implementation details. The first contract set should include:

- Session identifiers such as `sessionId`, `conversationId`, and `canvasId`.
- Session identifiers such as `sessionId`, `conversationId`, and later `canvasId` when canvas-aware flows are migrated.
- Agent request and response shapes.
- Stream event types such as `run.started`, `message.delta`, `tool.started`, `tool.completed`, `run.completed`, and `run.failed`.
- API request and response schemas.
- Error shapes and stable error codes.

The rule is simple: if a value crosses app boundaries, it belongs in `shared`. If it is an internal implementation detail, it does not.

The first concrete contract surface should be small and explicit:

- `GET /api/health`
  - Returns server liveness and version metadata.
- `POST /api/agent/runs`
  - Starts a run and returns identifiers needed by the client.
- `GET /api/agent/runs/:runId/events`
  - Streams SSE events for the active run.
- `POST /api/agent/runs/:runId/cancel`
  - Cancels the active run.

These endpoints are intentionally narrow. They are sufficient for Phase D and Phase A without prematurely modeling the entire Jaaz backend.

## Runtime Flow

1. The client starts a chat request.
2. The server creates a run context and resolves shared identifiers.
3. LangGraph executes the graph and streams progress.
4. The server forwards streamed events to the client.
5. The client renders incremental output and tool progress.

This runtime flow must exist in mock form during Phase D and in real form during Phase A.

## Risks

- A monorepo rewrite can easily become a large rewrite without progress if the contract layer is not defined early.
- Putting the agent runtime inside Next.js would blur boundaries and make the server harder to evolve.
- Desktop-specific behavior can become a second product if the Electron shell is not kept thin.
- A WebSocket-first design would add unnecessary complexity before the product needs bidirectional realtime sync.
- Tool execution and streaming semantics can drift if the server contract is not shared with the UI from the start.

## Validation

The migration is not done until the foundation and agent path are both proven.

Phase D validation:

- `apps/web` runs.
- `apps/desktop` runs.
- `apps/server` runs.
- Shared types compile across the repo.
- A mock stream can pass from client to server and back.

Phase A validation:

- A real LangGraph JS agent responds through the server.
- At least one tool can be invoked through the new registry.
- Streamed updates are visible to the client during execution.
- Cancellation or interruption is supported for the active run.

## Implementation Notes

- Follow the official LangGraph JS docs for graph setup, streaming, and runtime behavior.
- Prefer small files with one responsibility instead of large service blobs.
- Keep the repo extensible for future canvas and generation workflows, but do not build those paths before the chat foundation is stable.
- Treat the current Jaaz codebase as migration source material, not the target architecture.

## References

- LangGraph JS Overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph JS Streaming: https://docs.langchain.com/oss/javascript/langgraph/streaming
- LangGraph JS Interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangGraph JS Application Structure: https://docs.langchain.com/oss/javascript/langgraph/application-structure
