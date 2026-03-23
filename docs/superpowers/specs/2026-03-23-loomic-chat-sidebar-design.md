# Loomic Chat Sidebar System Design

> **Status:** Approved. Phase 1 of Chat integration: sidebar chat UI integrated with canvas.

**Goal:** Replace the demo chat workbench with a production-quality chat sidebar that lives alongside the canvas, using the existing SSE streaming infrastructure for real-time AI responses.

**Architecture:** Chat sidebar component → existing run creation API → SSE event stream → message rendering. No backend changes needed — the agent run system and SSE streaming are already functional.

**Tech Stack:** React 19, Next.js App Router, Tailwind v4, existing SSE streaming.

---

## Layout

Canvas page becomes a split layout:
```
┌─────────────────────────────────┬────────────────┐
│                                 │  Chat Sidebar   │
│         Excalidraw Canvas       │                 │
│                                 │  Messages...    │
│                                 │                 │
│                                 │  [Input area]   │
└─────────────────────────────────┴────────────────┘
```

- Canvas: flexible width, fills remaining space
- Chat sidebar: 400px fixed width, collapsible via toggle button
- Sidebar state persisted in localStorage

## Components

### ChatSidebar

Top-level wrapper with:
- Header (title + collapse button)
- Message list (scrollable)
- Input area (textarea + send button)
- Status indicator (streaming, idle, error)

### ChatMessage

Renders individual messages:
- **User messages**: Right-aligned, user avatar, plain text
- **Assistant messages**: Left-aligned, AI avatar, streaming text with cursor
- **Tool activities**: Inline indicators showing tool name + status (running/completed)

### ChatInput

Text input with:
- Multi-line textarea (auto-resize)
- Send button (disabled while streaming)
- Keyboard shortcut: Enter to send, Shift+Enter for newline

## State Management

No external state library. Local React state in the chat sidebar:

```typescript
type ChatState = {
  messages: ChatMessage[];       // Accumulated messages
  status: "idle" | "streaming" | "error";
  currentRunId: string | null;
};
```

Message format (simplified from SSE events):
```typescript
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;                   // Text content (accumulated from deltas)
  toolActivities?: ToolActivity[];   // Tool calls during this message
};

type ToolActivity = {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed";
  outputSummary?: string;
};
```

## Integration with Existing Infrastructure

### Run Creation
Uses existing `POST /api/agent/runs` endpoint:
```typescript
const response = await createRun({
  sessionId: generateId(),
  conversationId: canvasId,  // Link chat to canvas
  prompt: userMessage,
});
```

### SSE Streaming
Uses existing `streamEvents(runId)` from `apps/web/src/lib/stream-events.ts`:
```typescript
for await (const event of streamEvents(runId)) {
  switch (event.type) {
    case "message.delta": // Append to current assistant message
    case "tool.started":  // Add tool activity
    case "tool.completed": // Update tool activity status
    case "run.completed": // Set status to idle
  }
}
```

### Canvas Integration
The chat sidebar is a sibling of the CanvasEditor in the canvas page layout. Both share the same `canvasId` and `accessToken`.

## File Structure

```
apps/web/src/
├── app/
│   └── canvas/
│       └── page.tsx              ← Updated: split layout with sidebar
├── components/
│   ├── canvas-editor.tsx         ← Existing (no changes)
│   ├── chat-sidebar.tsx          ← NEW: main sidebar component
│   ├── chat-message.tsx          ← NEW: message rendering
│   └── chat-input.tsx            ← NEW: input area
```

## Scope Exclusions

- Message persistence to Supabase (Phase 2)
- Markdown rendering (Phase 2 — plain text for now)
- Image result display in chat (Phase 2)
- Tool confirmation UI (Phase 2)
- Session management / conversation switching (Phase 2)
- Canvas asset placement from chat (Phase 2)
