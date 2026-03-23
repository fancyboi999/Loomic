# Loomic Phase A Deep Agents Design

> **Status:** Approved design target for Phase A. This document supersedes the earlier Phase A assumption that Loomic would directly mirror Jaaz's legacy LangGraph agent structure.

**Goal:** Replace Loomic's mock run path with a real JavaScript agent runtime built on the latest `deepagents` architecture, while keeping the current Web/Desktop contract stable and avoiding premature expansion into media generation workflows.

**Architecture:** `apps/server` will host a single `deepagents` supervisor-style runtime created with the latest JavaScript API. The initial production-like path will use one main agent, SSE streaming, one observable tool lifecycle, and a backend abstraction designed for future persistence. Subagents remain available but optional; they are introduced only when isolation or specialization is necessary. Web and Desktop continue to consume the existing Loomic SSE contract through the standalone server.

**Tech Stack:** `TypeScript`, `Node.js`, `Fastify`, `deepagents`, `LangChain 1.x`, `LangGraph` runtime/state, `SSE`, `zod`, `vitest`, `Next.js`, `Electron`, `CompositeBackend`, `StateBackend`, `FilesystemBackend` for dev only.

---

## Context

Loomic Phase D is already complete: the monorepo foundation runs, Web and Desktop share one contract layer, the server exposes a mock run path, and the current workbench renders streamed events from the server.

The next decision is not a straight port of Jaaz's old Python orchestration. Jaaz currently uses an older LangGraph ecosystem shape: prebuilt `create_react_agent`, `langgraph_swarm`, custom handoff tools, and a handwritten stream processor. That system is historical reference material only. Loomic should not reproduce its internal agent topology.

The agent layer for Loomic Phase A should instead align with the latest JavaScript Deep Agents architecture:

- `createDeepAgent` as the main agent harness
- backend-driven filesystem tooling
- optional subagents for delegated work
- streaming-first execution
- a clear separation between development-only local filesystem access and production-safe backend choices

Official docs are the authority for this phase:

- Deep Agents Overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Subagents: https://docs.langchain.com/oss/javascript/deepagents/subagents
- Backends: https://docs.langchain.com/oss/javascript/deepagents/backends
- Streaming: https://docs.langchain.com/oss/javascript/deepagents/streaming
- Documentation index: https://docs.langchain.com/llms.txt

## Design Principles

- Do not port Jaaz's legacy multi-agent graph shape unless Loomic proves it needs that complexity.
- Keep one stable server-facing SSE contract for Web and Desktop.
- Start with one real agent and one observable tool lifecycle, not a full media pipeline.
- Treat filesystem access as a backend policy decision, not a default entitlement.
- Separate development ergonomics from production safety.

## Non-Goals

- Recreating Jaaz's `planner + image_video_creator + swarm` topology.
- Shipping media generation workflows in the first real agent slice.
- Exposing unrestricted host filesystem or shell access in a production web-serving context.
- Binding Supabase into the first real agent runtime before the agent path itself is proven.
- Replacing the current Web/Desktop client contract unless strictly necessary.

## Proposed Runtime Shape

### Main Agent

Phase A starts with one main Loomic agent. It is responsible for:

- receiving the current user prompt and conversation context
- deciding whether to answer directly or use a tool
- emitting streamed text output
- surfacing tool progress through the existing server event contract

This agent is the only required execution unit for the first Phase A milestone.

### Subagents

Subagents are explicitly supported by the architecture, but they are not mandatory in the first milestone.

They should be introduced only when one of these becomes true:

- a domain requires specialized prompts or tool scopes
- a task benefits from delegated planning/research/execution
- context isolation materially improves reliability

This means Loomic should be designed for subagents, but not start by over-fragmenting the runtime.

## Backend Strategy

Deep Agents expose filesystem tools through pluggable backends. Loomic should use that system directly rather than inventing a custom file tool layer in Phase A.

### Development

Allowed choices:

- `FilesystemBackend` for local project access in controlled development, with `virtualMode: true`
- `LocalShellBackend` only for tightly controlled local development when shell execution is intentionally enabled behind an explicit local-only flag and a dedicated working root

This is acceptable because the operator is the developer and the environment is trusted.

### Production

Default posture:

- do not use host filesystem backends as the primary web-facing backend
- do not expose unrestricted host shell execution to the production agent runtime

Phase A production choice is deliberately narrow:

- `CompositeBackend`
- `/workspace/` -> `StateBackend`
- `/memories/` -> `StateBackend`

In other words, Phase A production remains state-backed only. The route split exists now so Loomic can later move `/memories/` or other prefixes onto a durable backend without rewriting the runtime boundary, but no durable backend is required in this phase.

This keeps the first agent runtime safe and extensible without pretending that Supabase-backed or store-backed persistence already exists.

## Supabase Positioning

Supabase is approved as Loomic's future business storage layer, but it should not be forced into the first Phase A implementation.

Phase A should first prove:

- the real agent runtime
- the tool path
- the streaming contract
- the backend boundary

Only after that should Loomic bind durable project/session/workspace data to Supabase.

In other words:

- Supabase is a planned persistence target
- it is not the first implementation dependency for the real agent runtime
- Phase A production memory remains state-backed only

## Server Design

`apps/server` remains the single runtime boundary for agent execution.

New Phase A modules should be introduced along these lines:

- `src/agent/deep-agent.ts`
  - creates the main deep agent with the current model, tool set, and backend
- `src/agent/tools/`
  - registers the first real tool and any helper wrappers
- `src/agent/backends/`
  - defines development and production backend factories
- `src/agent/runtime.ts`
  - starts runs, manages cancellation, and bridges deep agent streaming to Loomic events
- `src/http/runs.ts`
  - keeps the existing HTTP shape while swapping the implementation from mock runs to real agent runs

The current mock run store should be preserved only as fallback or test utility until the real runtime has equivalent coverage.

## Streaming Contract

The server should preserve Loomic's client-facing SSE model. Internally, deepagents may stream richer data, but the server is responsible for mapping that stream onto the shared contract.

Phase A must not assume one raw deepagents stream mode is sufficient. The runtime adapter should consume the deepagents streaming modes needed to reconstruct a stable client contract, specifically the equivalents of:

- token/message output
- step or tool progress updates
- runtime terminal state

The first real mapping should preserve these event families:

- `run.started`
- `message.delta`
- `tool.started`
- `tool.completed`
- `run.canceled`
- `run.completed`
- `run.failed`

This keeps Web and Desktop stable and prevents a second round of client churn during Phase A.

The mapping rules should be simple:

- text deltas from the agent become `message.delta`
- tool lifecycle updates become `tool.started` and `tool.completed`
- user-initiated cancellation becomes `run.canceled`
- runtime failures become `run.failed`
- normal completion becomes `run.completed`

Correlation rules must also be explicit:

- `messageId` must be stable for all deltas belonging to the same assistant response
- `toolCallId` must remain stable for all lifecycle events belonging to the same tool execution
- the adapter, not the client, is responsible for deriving or preserving these identifiers from deepagents runtime output

Subagent behavior for Phase A is also constrained:

- subagents may exist internally, but client streaming remains normalized to the same Loomic event families
- the client does not need a separate subagent event model in this phase

## First Real Tool

The first real tool should not be image or video generation.

Recommended categories:

- a local project or workspace search path
- a notes or memory read path
- a safe filesystem-backed retrieval path

Why:

- lower cost
- easier verification
- clearer signal that the agent is really choosing and using tools
- avoids introducing external media-provider complexity too early

The first observable tool invocation may come from either:

- one Loomic-defined read-only tool such as `project_search`, or
- one deliberate filesystem-backed retrieval action exposed through the configured backend

Either way, Phase A must make the tool lifecycle observable and testable. The goal is to validate the architecture, not impress with capability breadth.

## Validation

Phase A is complete only when all of the following are true:

- `POST /api/agent/runs` starts a real deep agent run
- the agent streams text deltas back to the client
- at least one real tool or deliberate backend-powered retrieval action can be selected and invoked
- tool progress appears through the existing Loomic SSE contract
- cancellation still works for an active run
- cancellation emits a distinct terminal event and does not look like a transport failure
- Web and Desktop continue to work without a contract rewrite

## Risks

- Deep Agents can encourage overly broad filesystem exposure if backend policy is not explicit from the start.
- Adding subagents too early could recreate the same architectural sprawl that Loomic is trying to avoid.
- Binding Supabase too early would mix persistence design with runtime validation and slow down Phase A.
- A client contract rewrite during Phase A would create unnecessary churn while the runtime is still stabilizing.

## Implementation Notes

- Treat Jaaz's old Python agent layer as context, not target behavior.
- Use the latest JavaScript Deep Agents and LangChain APIs, not deprecated legacy patterns.
- Keep the first implementation narrow and observable.
- Design the backend layer so Supabase or another durable store can be added later without rewriting the agent runtime boundary.

## References

- Deep Agents Overview: https://docs.langchain.com/oss/javascript/deepagents/overview
- Deep Agents Subagents: https://docs.langchain.com/oss/javascript/deepagents/subagents
- Deep Agents Backends: https://docs.langchain.com/oss/javascript/deepagents/backends
- Deep Agents Streaming: https://docs.langchain.com/oss/javascript/deepagents/streaming
- LangChain Docs Index: https://docs.langchain.com/llms.txt
