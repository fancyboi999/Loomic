# Canvas Manipulation Tool

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the model a `manipulate_canvas` tool to move, resize, delete, restyle, add shapes/text on the Excalidraw canvas, plus optimize `inspect_canvas` with filtering.

**Architecture:** Tool reads canvas content from DB, applies operations, writes back. A new `canvas.sync` SSE event notifies the frontend to reload from DB. This mirrors `inspect_canvas` (reads DB) and avoids complex frontend command routing.

**Tech Stack:** TypeScript, Zod, Supabase, LangChain tool, Vitest

---

## Tasks

### Task 1: Create `manipulate_canvas` tool
### Task 2: Add `canvas.sync` SSE event and frontend reload
### Task 3: Enhance `inspect_canvas` with filter params
### Task 4: Wire tools into agent and update prompt
### Task 5: Tests and verification
