# Tool Output Display — Card + Modal Progressive Disclosure

**Date**: 2026-03-25
**Status**: Approved

## Problem

Agent tool calls in the chat sidebar currently only display tool input parameters when expanded. Tool output is limited to a truncated `outputSummary` shown inline after the tool name. There is no way to view full tool output, and long content has no proper formatting or overflow handling.

**Reference**: Lovart uses a card + modal progressive disclosure pattern — compact output card in chat, full details in a modal on demand.

## Design

### Three-Layer Progressive Disclosure

| Layer | Content | Interaction |
|-------|---------|-------------|
| 1. Status line | Tool icon + name + spinner/checkmark | Always visible |
| 2. Output card | Summary title + output preview (2-3 lines) + "Check Details" | Visible after tool completes |
| 3. Detail modal | Full input (collapsible) + full output (formatted) + image thumbnails | Click "Check Details" |

### Data Schema Changes

Add `output: Record<string, unknown>` (optional) to both `toolBlockSchema` and `toolCompletedEventSchema`.

```typescript
// packages/shared/src/contracts.ts — toolBlockSchema
output: z.record(z.unknown()).optional()

// packages/shared/src/events.ts — toolCompletedEventSchema
output: z.record(z.unknown()).optional()

// packages/shared/src/contracts.ts — chatToolActivitySchema
output: z.record(z.unknown()).optional()
```

- `output`: Full structured tool output for modal display
- `outputSummary`: Short summary (<=200 chars) for card title — unchanged
- Size limit: If serialized `output` exceeds 10KB, drop it (fall back to `outputSummary` only)

### Backend: stream-adapter.ts

New function `extractOutput(output: unknown): Record<string, unknown> | undefined`:
1. Extract structured data from ToolMessage / object / Command wrapper
2. Reuse existing `unwrapCommandOutput`, `tryParseJson`, `extractChunkText`
3. Return `undefined` if serialized size > 10KB
4. Strip fields already captured by `artifacts` (e.g., `imageUrl`, `url`) to avoid redundancy

Emit in `tool.completed` event:
```typescript
yield {
  type: "tool.completed",
  toolCallId,
  toolName,
  output: extractOutput(rawOutput),
  outputSummary: summarizeOutput(rawOutput),
  artifacts: extractedArtifacts,
  runId: options.runId,
  timestamp: now(),
};
```

### Frontend: ToolBlockView Redesign

#### Layer 1 — Status Line (always visible)
```
[spinner/checkmark] Tool Name
```
Remove the inline `— outputSummary` truncated text (summary moves to card).

#### Layer 2 — Output Card (after completion)
```
+--------------------------------------+
|  outputSummary (title, medium weight) |
|  key1: value1                         |  <- preview: first 2-3 entries from output
|  key2: value2...                      |
|                                       |
|  < Check Details                      |  <- only if output or input exists
+--------------------------------------+
```

- Style: `rounded-lg border border-black/[0.06] bg-[#FAFAFA]`
- Title: `outputSummary`, font-medium
- Preview: First 2-3 key-value pairs from `output`, single-line truncated
- No image thumbnails in card (images visible on canvas)
- Hidden while tool is running

#### Layer 3 — Detail Modal (on "Check Details" click)
```
+---------------------------------------------+
|  Project Search                         [X]  |
|---------------------------------------------|
|                                              |
|  Input                                  [v]  |  <- collapsible, default collapsed
|  query: "foundation"                         |
|                                              |
|  Output                                      |
|  {                                           |
|    "matchCount": 3,                          |  <- JSON.stringify(output, null, 2)
|    "files": ["src/a.ts", ...]                |     in <pre> block
|  }                                           |
|                                              |
|  [image thumbnails if artifacts exist]       |
|                                              |
+---------------------------------------------+
```

- Implementation: Native `<dialog>` element + Tailwind, no new dependencies
- Title: `formatToolName(toolName)`
- Input section: Collapsible, default collapsed, key-value list
- Output section:
  - Has `output` object: `JSON.stringify(output, null, 2)` in `<pre>`, `max-h-[400px] overflow-y-auto`
  - Only `outputSummary`: Plain text display
  - Has `artifacts` (images): Render thumbnails below output
- Close: X button, backdrop click, ESC key

### Component Structure

```
chat-message.tsx
  +-- ToolBlockView          (refactored: status line + card)
  +-- ToolDetailModal        (new: modal dialog)
```

Both in `chat-message.tsx` (current ~195 lines, estimated ~350 after changes).

### Frontend Event Handling (chat-sidebar.tsx)

Update `handleStreamEvent` for `tool.completed`:
```typescript
case "tool.completed":
  // Add output field alongside existing outputSummary and artifacts
  return {
    ...block,
    status: "completed",
    output: event.output,
    outputSummary: event.outputSummary,
    ...(event.artifacts ? { artifacts: event.artifacts } : {}),
  };
```

## Backward Compatibility

- Messages without `output` field degrade to showing `outputSummary` text only
- `chatToolActivitySchema` gets `output` field for consistency, existing data unaffected (field is optional)
- No migration needed — purely additive schema change

## Out of Scope

- Tool-type-specific renderers (e.g., brand kit card with color swatches) — future enhancement
- Rich Markdown rendering in output — use plain text / JSON for now
- Output streaming (showing partial output as tool runs) — not needed currently
