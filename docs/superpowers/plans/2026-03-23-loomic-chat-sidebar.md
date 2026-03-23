# Chat Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a chat sidebar to the canvas page, using existing SSE streaming for real-time AI responses.

**Architecture:** Purely frontend changes — no backend modifications needed. Uses existing `createRun()` and `streamEvents()`.

**Tech Stack:** React 19, Next.js, Tailwind v4.

---

### Task 1: Create chat sidebar components

**Files:**
- Create: `apps/web/src/components/chat-sidebar.tsx`
- Create: `apps/web/src/components/chat-message.tsx`
- Create: `apps/web/src/components/chat-input.tsx`

### Task 2: Integrate chat sidebar into canvas page

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx` — add split layout with chat sidebar

### Task 3: Full verification

**Files:**
- None created (verification only)
