# Tool Output Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card + modal progressive disclosure for agent tool outputs in the chat sidebar, so users can see both tool input and output with proper formatting.

**Architecture:** Add `output` field to shared schemas and SSE events. Backend extracts structured output from LangChain tool results. Frontend replaces inline expand with output card + detail modal pattern.

**Tech Stack:** Zod (schema), Vitest (tests), React + Tailwind + native `<dialog>` (frontend)

**Spec:** `docs/superpowers/specs/2026-03-25-tool-output-display-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/contracts.ts` | Modify | Add `output` to `toolBlockSchema` and `chatToolActivitySchema` |
| `packages/shared/src/events.ts` | Modify | Add `output` to `toolCompletedEventSchema` |
| `apps/server/src/agent/stream-adapter.ts` | Modify | Add `extractOutput()`, wire into `tool.completed` emission |
| `apps/server/test/stream-adapter.test.ts` | Modify | Add tests for `extractOutput` behavior |
| `apps/web/src/components/chat-message.tsx` | Modify | Redesign `ToolBlockView` (card), add `ToolDetailModal` |
| `apps/web/src/components/chat-sidebar.tsx` | Modify | Pass `output` through in `handleStreamEvent` and `mapServerMessages` |

---

### Task 1: Schema — Add `output` field to shared types

**Files:**
- Modify: `packages/shared/src/contracts.ts:129-137` (toolBlockSchema)
- Modify: `packages/shared/src/contracts.ts:109-116` (chatToolActivitySchema)
- Modify: `packages/shared/src/events.ts:42-50` (toolCompletedEventSchema)

- [ ] **Step 1: Add `output` to `toolBlockSchema`**

In `packages/shared/src/contracts.ts`, add `output` field to `toolBlockSchema`:

```typescript
export const toolBlockSchema = z.object({
  type: z.literal("tool"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
});
```

- [ ] **Step 2: Add `output` to `chatToolActivitySchema`**

In the same file, add `output` field to `chatToolActivitySchema`:

```typescript
export const chatToolActivitySchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: z.enum(["running", "completed"]),
  input: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
});
```

- [ ] **Step 3: Add `output` to `toolCompletedEventSchema`**

In `packages/shared/src/events.ts`:

```typescript
export const toolCompletedEventSchema = z.object({
  type: z.literal("tool.completed"),
  runId: runIdSchema,
  toolCallId: toolCallIdSchema,
  toolName: z.string().min(1),
  output: z.record(z.unknown()).optional(),
  outputSummary: z.string().optional(),
  artifacts: z.array(toolArtifactSchema).optional(),
  timestamp: timestampSchema,
});
```

- [ ] **Step 4: Verify type compilation**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm exec tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/contracts.ts packages/shared/src/events.ts
git commit -m "feat: add output field to tool block and event schemas"
```

---

### Task 2: Backend — Add `extractOutput` function with tests

**Files:**
- Modify: `apps/server/src/agent/stream-adapter.ts`
- Modify: `apps/server/test/stream-adapter.test.ts`

- [ ] **Step 1: Write failing tests for `extractOutput` behavior**

Add to `apps/server/test/stream-adapter.test.ts` a new `describe("extractOutput via tool.completed")` block. These tests verify that `tool.completed` events include the `output` field by driving through the existing `adaptDeepAgentStream` function.

Note: Tests must wrap streams with `adaptDeepAgentStream(...)` (not call `collectEvents(makeStream(...))` directly), and use `as any` casts on the returned events since `collectEvents` returns `unknown[]`. Follow the same pattern as existing tests in the file.

```typescript
describe("extractOutput via tool.completed", () => {
  const baseOpts = {
    conversationId: "c",
    now: () => "2026-01-01T00:00:00.000Z",
    runId: "run_1",
    sessionId: "s",
  };

  it("includes structured output from tool end event", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "project_search",
        run_id: "tool_run_1",
        data: { input: { query: "test" } },
      },
      {
        event: "on_tool_end",
        name: "project_search",
        run_id: "tool_run_1",
        data: {
          output: JSON.stringify({ matchCount: 3, summary: "Found 3 files", files: ["a.ts", "b.ts", "c.ts"] }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find((e: any) => e.type === "tool.completed") as any;
    expect(completed).toBeDefined();
    expect(completed.output).toEqual({ matchCount: 3, summary: "Found 3 files", files: ["a.ts", "b.ts", "c.ts"] });
  });

  it("strips artifact keys from output when artifacts are extracted", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "some_tool",
        run_id: "tool_run_2",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "some_tool",
        run_id: "tool_run_2",
        data: {
          output: JSON.stringify({
            imageUrl: "https://cdn.example.com/img.png",
            mimeType: "image/png",
            width: 512,
            height: 512,
            summary: "Generated image",
            extraInfo: "kept",
          }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find((e: any) => e.type === "tool.completed") as any;
    expect(completed).toBeDefined();
    // artifact keys stripped, non-artifact keys kept
    expect(completed.output).toEqual({ summary: "Generated image", extraInfo: "kept" });
  });

  it("returns undefined output when serialized size exceeds 10KB", async () => {
    const bigValue = "x".repeat(11000);
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "big_tool",
        run_id: "tool_run_3",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "big_tool",
        run_id: "tool_run_3",
        data: {
          output: JSON.stringify({ data: bigValue }),
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find((e: any) => e.type === "tool.completed") as any;
    expect(completed).toBeDefined();
    expect(completed.output).toBeUndefined();
  });

  it("returns undefined output for non-parseable output", async () => {
    const stream = makeStream([
      {
        event: "on_tool_start",
        name: "text_tool",
        run_id: "tool_run_4",
        data: { input: {} },
      },
      {
        event: "on_tool_end",
        name: "text_tool",
        run_id: "tool_run_4",
        data: {
          output: "plain text output not json",
        },
      },
    ]);

    const events = await collectEvents(
      adaptDeepAgentStream({ ...baseOpts, stream }),
    );
    const completed = events.find((e: any) => e.type === "tool.completed") as any;
    expect(completed).toBeDefined();
    expect(completed.output).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server && npx vitest run test/stream-adapter.test.ts`
Expected: New tests FAIL (output field is undefined because `extractOutput` doesn't exist yet)

- [ ] **Step 3: Implement `extractOutput` function**

Add to `apps/server/src/agent/stream-adapter.ts`, after the existing `extractArtifacts` function:

```typescript
const ARTIFACT_KEYS = new Set(["url", "imageUrl", "mimeType", "width", "height", "placement", "jobId"]);
const OUTPUT_SIZE_LIMIT = 10240; // 10KB

function extractOutput(
  output: unknown,
  hasArtifacts: boolean,
): Record<string, unknown> | undefined {
  let text = "";
  if (ToolMessageClass.isInstance(output)) {
    text = extractChunkText(output);
  } else if (typeof output === "string") {
    text = output;
  } else if (output && typeof output === "object") {
    text = JSON.stringify(output);
  }

  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const unwrapped = unwrapCommandOutput(parsed as Record<string, unknown>);

  // Strip artifact keys if artifacts were extracted
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(unwrapped)) {
    if (hasArtifacts && ARTIFACT_KEYS.has(key)) continue;
    result[key] = value;
  }

  // Skip if empty after stripping
  if (Object.keys(result).length === 0) return undefined;

  // Size limit check
  const serialized = JSON.stringify(result);
  if (serialized.length > OUTPUT_SIZE_LIMIT) return undefined;

  return result;
}
```

- [ ] **Step 4: Wire `extractOutput` into `on_tool_end` handler**

In the `on_tool_end` block of `adaptDeepAgentStream`, add `extractOutput` call and include `output` in the existing yield. This is a **surgical addition** — keep all existing logic (`isInnerSubAgentTool`, `jobInfo` check, etc.) intact, only add the `extractedOutput` variable and the `output` field:

```typescript
// Add this line AFTER the existing extractedArtifacts computation
const extractedOutput = extractOutput(output, (extractedArtifacts?.length ?? 0) > 0);

// In the existing yield statement, add the output field:
yield {
  output: extractedOutput,          // ADD THIS LINE
  outputSummary: summarizeOutput(output),  // existing
  artifacts: extractedArtifacts,           // existing
  runId: options.runId,                    // existing
  timestamp: now(),                        // existing
  toolCallId,                              // existing
  toolName,                                // existing
  type: "tool.completed",                  // existing
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/server && npx vitest run test/stream-adapter.test.ts`
Expected: ALL tests PASS (including existing tests)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/agent/stream-adapter.ts apps/server/test/stream-adapter.test.ts
git commit -m "feat: add extractOutput to stream-adapter for structured tool output"
```

---

### Task 3: Frontend — Update event handling to pass `output` through

**Files:**
- Modify: `apps/web/src/components/chat-sidebar.tsx:266-353` (handleStreamEvent)
- Modify: `apps/web/src/components/chat-sidebar.tsx:53-83` (mapServerMessages)

- [ ] **Step 1: Update `handleStreamEvent` for `tool.completed`**

In `apps/web/src/components/chat-sidebar.tsx`, in the `tool.completed` case (around line 307-332), add `output` field:

```typescript
case "tool.completed":
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== assistantId) return m;
      return {
        ...m,
        contentBlocks: m.contentBlocks.map((block) => {
          if (
            block.type === "tool" &&
            block.toolCallId === event.toolCallId
          ) {
            return {
              ...block,
              status: "completed" as const,
              output: event.output,
              outputSummary: event.outputSummary,
              ...(event.artifacts
                ? { artifacts: event.artifacts }
                : {}),
            };
          }
          return block;
        }),
      };
    }),
  );
  break;
```

- [ ] **Step 2: Update `mapServerMessages` legacy path**

In the same file, in the `mapServerMessages` function (around line 64-75), add `output` and `input` to the legacy tool activity mapping. Note: `input` forwarding is a pre-existing omission being fixed here — the current code doesn't forward `ta.input`, which is needed for the modal to display input parameters on historical messages:

```typescript
if (m.toolActivities) {
  for (const ta of m.toolActivities) {
    blocks.push({
      type: "tool",
      toolCallId: ta.toolCallId,
      toolName: ta.toolName,
      status: ta.status as "running" | "completed",
      ...(ta.input ? { input: ta.input } : {}),
      ...(ta.output ? { output: ta.output } : {}),
      ...(ta.outputSummary ? { outputSummary: ta.outputSummary } : {}),
      ...(ta.artifacts ? { artifacts: ta.artifacts } : {}),
    });
  }
}
```

- [ ] **Step 3: Run existing frontend tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web && npx vitest run test/chat-sidebar.test.tsx`
Expected: ALL existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat-sidebar.tsx
git commit -m "feat: pass tool output through event handling and legacy message mapping"
```

---

### Task 4: Frontend — Redesign ToolBlockView with card + modal

**Files:**
- Modify: `apps/web/src/components/chat-message.tsx`

- [ ] **Step 1: Add helper functions**

Add `isHumanReadable` and `formatOutputPreview` utilities at the bottom of `chat-message.tsx`:

```typescript
/** Check if outputSummary looks like a human sentence (not raw JSON) */
function isHumanReadable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return false;
  return true;
}

/** Format a preview of output key-value pairs (max 3 entries) */
function formatOutputPreview(output: Record<string, unknown>): string[] {
  const entries = Object.entries(output).slice(0, 3);
  return entries.map(([key, value]) => {
    const formattedKey = formatParamName(key);
    let formattedValue: string;
    if (value === null || value === undefined) {
      formattedValue = "—";
    } else if (typeof value === "string") {
      formattedValue = value.length > 80 ? `${value.slice(0, 77)}...` : value;
    } else if (typeof value === "boolean") {
      formattedValue = value ? "Yes" : "No";
    } else if (typeof value === "number") {
      formattedValue = String(value);
    } else if (Array.isArray(value)) {
      formattedValue = `[${value.length} items]`;
    } else {
      formattedValue = "{...}";
    }
    return `${formattedKey}: ${formattedValue}`;
  });
}
```

- [ ] **Step 2: Add `ToolDetailModal` component**

Add new component in `chat-message.tsx`:

```typescript
function ToolDetailModal({
  block,
  open,
  onClose,
}: {
  block: ToolBlock;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const hasInput = block.input && Object.keys(block.input).length > 0;
  const [inputExpanded, setInputExpanded] = useState(false);

  // Reset input expanded state when modal closes
  useEffect(() => {
    if (!open) setInputExpanded(false);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={formatToolName(block.toolName)}
      className="m-auto max-w-lg w-full rounded-xl bg-white shadow-xl backdrop:bg-black/30 p-0"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
          <h3 className="text-sm font-semibold text-[#2F3640]">
            {formatToolName(block.toolName)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#A4A9B2] hover:bg-black/[0.04] hover:text-[#2F3640] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Input section — collapsible */}
          {hasInput && (
            <div>
              <button
                type="button"
                onClick={() => setInputExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-[#8B929D] hover:text-[#2F3640] transition-colors"
              >
                <svg
                  className={`h-3 w-3 transition-transform duration-150 ${inputExpanded ? "rotate-90" : ""}`}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 0 1-1.06-1.06L9.44 8 6.22 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
                输入
              </button>
              {inputExpanded && (
                <div className="mt-1.5 rounded-md bg-[#F8F8F8] border border-black/[0.04] px-2.5 py-2 text-[11px] text-[#5A6270] space-y-1">
                  {Object.entries(block.input!).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="shrink-0 font-medium text-[#8B929D]">
                        {formatParamName(key)}
                      </span>
                      <span className="break-all text-[#2F3640]">
                        {formatParamValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Output section */}
          {block.output ? (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">输出</div>
              <pre className="rounded-md bg-[#F8F8F8] border border-black/[0.04] px-2.5 py-2 text-[11px] text-[#2F3640] overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">
                {JSON.stringify(block.output, null, 2)}
              </pre>
            </div>
          ) : block.outputSummary ? (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">输出</div>
              <p className="text-xs text-[#2F3640]">{block.outputSummary}</p>
            </div>
          ) : null}

          {/* Image artifacts */}
          {block.artifacts && block.artifacts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-[#8B929D] mb-1.5">附件</div>
              <div className="flex flex-wrap gap-2">
                {block.artifacts.map((artifact) =>
                  artifact.type === "image" ? (
                    <img
                      key={artifact.url}
                      src={artifact.url}
                      alt={artifact.title ?? "Generated image"}
                      className="max-w-[200px] rounded-md border border-[#E3E3E3]"
                      loading="lazy"
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 3: Rewrite `ToolBlockView` with card + modal**

Replace the existing `ToolBlockView` function:

```typescript
function ToolBlockView({ block }: { block: ToolBlock }) {
  const [modalOpen, setModalOpen] = useState(false);
  const detailBtnRef = useRef<HTMLButtonElement>(null);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    detailBtnRef.current?.focus();
  }, []);

  const isCompleted = block.status === "completed";
  const hasOutput = block.output && Object.keys(block.output).length > 0;
  const hasDetails = hasOutput || (block.input && Object.keys(block.input).length > 0);

  // Determine card title
  const cardTitle = block.outputSummary && isHumanReadable(block.outputSummary)
    ? block.outputSummary
    : formatToolName(block.toolName);

  // Preview lines from output
  const previewLines = hasOutput ? formatOutputPreview(block.output!) : [];

  return (
    <div className="space-y-1">
      {/* Layer 1: Status line */}
      <div className="flex items-center gap-1.5 text-[11px] text-[#A4A9B2]">
        {block.status === "running" ? (
          <div className="h-3 w-3 animate-spin rounded-full border border-[#A4A9B2]/40 border-t-[#A4A9B2]" />
        ) : (
          <svg className="h-3 w-3 text-green-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
        )}
        <span className="font-medium">{formatToolName(block.toolName)}</span>
      </div>

      {/* Layer 2: Output card (only when completed) */}
      {isCompleted && (cardTitle || previewLines.length > 0) && (
        <div className="ml-[18px] rounded-lg border border-black/[0.06] bg-[#FAFAFA] px-3 py-2">
          {/* Card title */}
          <div className="text-xs font-medium text-[#2F3640] truncate">
            {cardTitle}
          </div>

          {/* Preview lines */}
          {previewLines.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {previewLines.map((line, i) => (
                <div key={i} className="text-[11px] text-[#8B929D] truncate">
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Check Details button */}
          {hasDetails && (
            <button
              ref={detailBtnRef}
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-1.5 flex items-center gap-0.5 text-[11px] text-[#A4A9B2] hover:text-[#2F3640] transition-colors cursor-pointer"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.78 11.78a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 1.06L6.56 8l3.22 3.22a.75.75 0 0 1 0 1.06Z" />
              </svg>
              查看详情
            </button>
          )}
        </div>
      )}

      {/* Layer 3: Detail modal */}
      {hasDetails && (
        <ToolDetailModal
          block={block}
          open={modalOpen}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Clean up — remove old helper and unused imports**

Remove `formatParamValue` truncation limit change is not needed — it's still used by the modal's input section. Keep it as-is.

Remove the old `expanded` state and chevron UI that was in the previous `ToolBlockView` — this is replaced by the new implementation above.

Update the React import at the top of the file to include all needed hooks:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
```

- [ ] **Step 5: Run existing tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic/apps/web && npx vitest run`
Expected: ALL existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat-message.tsx
git commit -m "feat: redesign ToolBlockView with output card and detail modal"
```

---

### Task 5: End-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Run all tests**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run test:packages`
Expected: ALL tests PASS across server and web

- [ ] **Step 2: Type check**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm exec turbo run build --filter=@loomic/shared`
Expected: Shared package builds without errors

- [ ] **Step 3: Dev server smoke test**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm dev`
Open browser, navigate to a project canvas, send a chat message that triggers a tool call. Verify:
1. Status line shows spinner → checkmark
2. Output card appears with title and preview
3. "查看详情" opens modal with input (collapsible) and output (formatted JSON)
4. Modal closes on X / backdrop / ESC
5. Historical messages load correctly with output cards

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address e2e issues from tool output display testing"
```
