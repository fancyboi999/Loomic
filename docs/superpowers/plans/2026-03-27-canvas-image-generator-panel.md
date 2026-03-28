# Canvas Image Generator Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate Lovart's canvas image generator experience — click to place a placeholder mock on canvas, configure generation params (model, reference image, resolution, ratio) in a panel below it, generate with scan animation, replace with real image on completion.

**Architecture:** A custom tldraw shape (`image-generator`) renders the placeholder/loading/result states. An attached floating panel component handles prompt, model selection, reference images, resolution, and ratio. The generation API call uses the existing `/api/generate` endpoint. During generation, a CSS shimmer animation scans across the placeholder. On completion, the shape is replaced with a standard image asset.

**Tech Stack:** tldraw (custom ShapeUtil), React, existing image generation API, CSS keyframe animation.

---

## Current State

- `canvas-ai-toolbar.tsx` has "AI Image" button that toggles `CanvasImageGenPanel`
- `CanvasImageGenPanel` is a simple prompt-only input
- No placeholder element on canvas
- No model/resolution/ratio selection
- No reference image support
- No generation animation

## Target State (matching Lovart)

### User Flow
1. User clicks "AI Image" in canvas toolbar
2. A **placeholder shape** appears on canvas (gray box, mountain icon, size label e.g. "1024 x 1024")
3. A **generator panel** appears below the shape with:
   - Prompt textarea
   - Model selector (icon + name + dropdown, from `/api/image-models`)
   - Reference image upload button
   - Resolution selector (1K / 2K / 4K, dynamic per model)
   - Aspect ratio selector (1:1, 16:9, 9:16, 4:3, 3:4)
   - Generate button
4. User fills prompt, configures options, clicks Generate
5. Placeholder shows **shimmer scan animation** (diagonal light sweep)
6. On completion, placeholder is replaced with the real generated image
7. On error, placeholder shows error state with retry option

---

### Task 1: ImageGenerator Custom Shape — Placeholder Rendering

**Files:**
- Create: `apps/web/src/components/canvas/image-generator-shape.tsx`
- Modify: `apps/web/src/components/canvas-editor.tsx` (register custom shape)

**What:** Define a custom tldraw `ShapeUtil` that renders three states:
- **idle**: Gray background + mountain/image SVG icon + size label (e.g. "1024 x 1024")
- **generating**: Same placeholder + shimmer scan animation overlay
- **error**: Red-tinted with error message + retry button

Shape props:
```typescript
type ImageGeneratorShapeProps = {
  w: number;
  h: number;
  status: "idle" | "generating" | "completed" | "error";
  prompt: string;
  model: string;
  aspectRatio: string;
  quality: string;
  errorMessage?: string;
  imageUrl?: string; // set on completion, triggers replacement
};
```

**Shimmer animation CSS:**
```css
@keyframes shimmer-scan {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```
A semi-transparent gradient bar sweeps left-to-right across the placeholder during `generating` state.

---

### Task 2: Generator Panel Component

**Files:**
- Create: `apps/web/src/components/canvas/image-generator-panel.tsx`

**What:** Floating panel that appears below the selected ImageGeneratorShape. Contains:

1. **Prompt textarea** — auto-resize, same styling as Lovart (`placeholder="今天我们要创作什么"`)
2. **Bottom toolbar row:**
   - Left side:
     - Model selector button (icon + model name + chevron, opens dropdown from `/api/image-models`)
     - Reference image upload button (opens file picker, preview thumbnails)
   - Right side:
     - Resolution dropdown (1K/2K/4K, filtered by selected model's capabilities)
     - Aspect ratio dropdown (1:1, 16:9, 9:16, 4:3, 3:4)
     - Generate button (lightning icon + disabled when no prompt)

**Model selector dropdown:** Reuse model list from `fetchImageModels()`, show icon + name per model, highlight current selection with checkmark.

**Reference image:** Upload to existing upload service, show thumbnail preview, pass URLs as `inputImages` to generation API.

---

### Task 3: Aspect Ratio ↔ Placeholder Size Sync

**What:** When user changes aspect ratio in the panel:
- Update the placeholder shape's `w` and `h` on canvas
- Size label updates (e.g. "1024 x 576" for 16:9)
- Placeholder visually resizes on canvas in real-time

Resolution mapping:
| Quality | 1:1 | 16:9 | 9:16 | 4:3 | 3:4 |
|---------|-----|------|------|-----|-----|
| 1K | 1024x1024 | 1024x576 | 576x1024 | 1024x768 | 768x1024 |
| 2K | 2048x2048 | 2048x1152 | 1152x2048 | 2048x1536 | 1536x2048 |

---

### Task 4: Generation Flow — API Call + Animation + Replacement

**Files:**
- Modify: `apps/web/src/components/canvas/image-generator-panel.tsx`
- Modify: `apps/web/src/components/canvas/image-generator-shape.tsx`

**Flow:**
1. User clicks Generate
2. Shape status → `"generating"`, shimmer animation starts
3. Call `generateImageDirect()` API (existing endpoint) with:
   - `prompt`, `model`, `aspectRatio`, `quality`, `inputImages`
4. On success:
   - Download image, create tldraw image asset
   - Replace the ImageGeneratorShape with a standard tldraw image shape at same position/size
   - Delete the ImageGeneratorShape
5. On error:
   - Shape status → `"error"`, show error message
   - User can retry or edit prompt

---

### Task 5: Wire into Canvas Toolbar

**Files:**
- Modify: `apps/web/src/components/canvas-ai-toolbar.tsx`

**What:** Replace the existing `CanvasImageGenPanel` toggle with:
1. Click "AI Image" → create an `ImageGeneratorShape` at viewport center
2. Auto-select the new shape
3. The generator panel renders as part of the shape's UI (or as a floating panel attached to it)

---

### Task 6: Polish — Animations, Transitions, Edge Cases

- Smooth shape creation animation (scale from 0.95 → 1.0)
- Shimmer gradient: `linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)`
- Panel positioning: always below shape, clamp to viewport
- Keyboard: Escape cancels generation, Enter in prompt focuses generate button
- Multiple generators: support multiple ImageGeneratorShapes on canvas simultaneously
- Undo/redo: shape creation and deletion should be undoable
