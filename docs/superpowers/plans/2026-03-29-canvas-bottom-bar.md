# Canvas Bottom Bar Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a floating toolbar at the bottom-left of the canvas with background color picker, layer management, element search, and zoom controls.

**Architecture:** Single new component `CanvasBottomBar` positioned absolutely in the canvas page. Receives `excalidrawApi` prop. Each sub-feature (color picker, layers, search, zoom) is a self-contained section within the component. Popover panels float upward from the toolbar.

**Tech Stack:** React, Tailwind CSS, Excalidraw API, react-colorful (already in deps)

---

### Task 1: Create CanvasBottomBar component with zoom controls

**Files:**
- Create: `apps/web/src/components/canvas-bottom-bar.tsx`
- Modify: `apps/web/src/app/canvas/page.tsx`

- [ ] **Step 1: Create the component file with zoom controls**

Create `apps/web/src/components/canvas-bottom-bar.tsx` with:
- Floating pill container at bottom-left
- Zoom out button, percentage display, zoom in button
- Click percentage to open preset menu (25%, 50%, 75%, 100%, 150%, 200%, Fit All)
- Read zoom from `excalidrawApi.getAppState().zoom.value`
- Update zoom via `excalidrawApi.updateScene({ appState: { zoom: { value } } })`
- Use `excalidrawApi.onChange()` to stay in sync when user pinch-zooms

- [ ] **Step 2: Add to canvas page**

In `apps/web/src/app/canvas/page.tsx`, import and render `CanvasBottomBar` inside the canvas area div (the `flex-1 relative` container), positioned `absolute bottom-4 left-4 z-20`.

- [ ] **Step 3: Remove zoom from logo menu**

Remove zoom in/out/fit from `canvas-logo-menu.tsx` dropdown to avoid duplication. Keep "显示画布所有元素" (scrollToContent) in the menu as it serves a different purpose (fit + scroll).

- [ ] **Step 4: Commit**

### Task 2: Add background color picker

**Files:**
- Modify: `apps/web/src/components/canvas-bottom-bar.tsx`

- [ ] **Step 1: Add background color button with indicator dot**

Add a button showing a small circle filled with the current `viewBackgroundColor`. On click, toggle a popover panel floating above the toolbar.

- [ ] **Step 2: Build color picker popover**

Popover contains:
- 8 preset colors: white (#FFFFFF), light gray (#F5F5F5), warm (#FFF8F0), cool (#F0F4FF), dark (#1E1E1E), black (#000000), accent (#d3f256), soft green (#E8F5E9)
- HexColorInput from react-colorful for custom hex
- Click preset or type hex → update `excalidrawApi.updateScene({ appState: { viewBackgroundColor } })`

- [ ] **Step 3: Commit**

### Task 3: Add layers panel

**Files:**
- Modify: `apps/web/src/components/canvas-bottom-bar.tsx`

- [ ] **Step 1: Add layers button**

SVG layers icon button. On click, toggle layers panel popover.

- [ ] **Step 2: Build layers panel**

Panel shows a scrollable list of canvas elements (from `excalidrawApi.getSceneElements()`), each row showing:
- Element type icon (rect/ellipse/text/image/line)
- Element label (text content for text, "Image" for images, shape type for shapes)
- Click row to select element on canvas (`excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } })`)
- Drag to reorder (or up/down buttons for simplicity)
- Elements listed in z-order (front on top)

Keep it simple — no visibility toggle for v1.

- [ ] **Step 3: Commit**

### Task 4: Add element search

**Files:**
- Modify: `apps/web/src/components/canvas-bottom-bar.tsx`

- [ ] **Step 1: Add search button**

Magnifying glass icon button. On click, toggle search popover.

- [ ] **Step 2: Build search popover**

- Text input for query
- Filter `getSceneElements()` by text content (for text elements) or element type
- Show matching results as clickable list
- Click result → select element and scroll to it (`selectedElementIds` + `scrollToContent` with the element bounds)

- [ ] **Step 3: Commit**
