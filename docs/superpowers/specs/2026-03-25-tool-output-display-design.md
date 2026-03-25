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
- DB impact: `output` is stored inside the `content_blocks` JSONB column via `ContentBlock[]`. The 10KB per-tool limit keeps this manageable.

### Backend: stream-adapter.ts

New function `extractOutput(output: unknown): Record<string, unknown> | undefined`:

Unwrapping pipeline (mirrors `extractArtifacts`):
1. If `ToolMessage`: `extractChunkText(output)` → `tryParseJson(text)` → `unwrapCommandOutput(parsed)`
2. If string: `tryParseJson(output)` → `unwrapCommandOutput(parsed)`
3. If object: `JSON.stringify(output)` → `tryParseJson(serialized)` → `unwrapCommandOutput(parsed)`
4. If result is not a non-null object, return `undefined`
5. Strip top-level keys already captured by `artifacts`: `["url", "imageUrl", "mimeType", "width", "height", "placement", "jobId"]` — only when `extractedArtifacts` is non-empty
6. Return `undefined` if `JSON.stringify(result).length > 10240`

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
- Title: If `outputSummary` looks like a human-readable sentence (not raw JSON), use it. Otherwise fallback to `formatToolName(toolName)` as title, and show `outputSummary` in the preview area instead.
- Preview: First 2-3 key-value pairs from `output` via `formatOutputPreview()` utility. Non-primitive values: arrays → `[N items]`, objects → `{...}`, strings truncated at 80 chars.
- No image thumbnails in card (images visible on canvas; thumbnails available in modal)
- Hidden while tool is running
- "Check Details" button: shown when `output` exists. (Input-only tools without output still show the card with just the title.)

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
- Close: X button, backdrop click, ESC key (native `<dialog>` + `showModal()` handles ESC and focus trap automatically)
- Accessibility: `aria-label` set to tool name, focus returns to "Check Details" button on close

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
  return {
    ...block,
    status: "completed",
    output: event.output,
    outputSummary: event.outputSummary,
    ...(event.artifacts ? { artifacts: event.artifacts } : {}),
  };
```

Update `mapServerMessages` legacy path to forward `output`:
```typescript
blocks.push({
  type: "tool",
  toolCallId: ta.toolCallId,
  toolName: ta.toolName,
  status: ta.status,
  ...(ta.input ? { input: ta.input } : {}),
  ...(ta.output ? { output: ta.output } : {}),          // NEW
  ...(ta.outputSummary ? { outputSummary: ta.outputSummary } : {}),
  ...(ta.artifacts ? { artifacts: ta.artifacts } : {}),
});
```

### Removed: Inline Input Expand Chevron

The existing chevron button that expands tool input inline is **removed**. Input is now viewable only in the modal via "Check Details". This avoids redundant UI (inline expand + modal both showing input). The existing inline artifact image rendering (`block.artifacts?.map(...)`) is also removed from the card — images are only shown in the modal detail view.

### Tool Error Handling

Tool-level errors are not modeled in `ToolBlock` (`status` is `"running" | "completed"` only). Failed tools remain in `running` state until the run itself fails via `run.failed` event, which is handled separately. This design does not change that behavior.

## Backward Compatibility

- Messages without `output` field degrade to showing `outputSummary` text only
- `chatToolActivitySchema` gets `output` field for consistency, existing data unaffected (field is optional)
- No migration needed — purely additive schema change

## Out of Scope

- Tool-type-specific renderers (e.g., brand kit card with color swatches) — future enhancement
- Rich Markdown rendering in output — use plain text / JSON for now
- Output streaming (showing partial output as tool runs) — not needed currently
