# Loomic Canvas Editor System Design

> **Status:** Approved. Phase 1 of Canvas integration: core Excalidraw editor with persistence.

**Goal:** Add a full-featured canvas editor to Loomic's web app, powered by Excalidraw, with canvas state persisted to Supabase. Users can open a project's primary canvas, draw/create content, and have it auto-saved.

**Architecture:** Excalidraw (client-side) → Server canvas API → Supabase `canvases.content` JSONB column. Canvas elements and app state stored as JSON, binary files (images) deferred to Phase 2.

**Tech Stack:** `@excalidraw/excalidraw`, Next.js App Router (`"use client"`), Tailwind v4 theming, Fastify canvas routes, Supabase.

---

## Supabase Schema Changes

Add `content` JSONB column to existing `canvases` table:

```sql
ALTER TABLE public.canvases
  ADD COLUMN content jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.canvases.content IS
  'Excalidraw canvas state: { elements, appState }';
```

Content structure:
```typescript
type CanvasContent = {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;  // viewBackgroundColor, gridMode, etc.
};
```

Binary files excluded from Phase 1 (too large for JSONB).

## Server API

Two new endpoints on the existing Fastify server:

### GET `/api/canvases/:canvasId`

Returns canvas metadata + content for an authenticated user.

```typescript
// Response
{
  id: string;
  name: string;
  projectId: string;
  content: CanvasContent;
}
```

Authorization: user must be a member of the canvas's project workspace.

### PUT `/api/canvases/:canvasId`

Saves canvas content (auto-save from frontend).

```typescript
// Request body
{
  content: CanvasContent;
}
```

Authorization: same as GET.

### Canvas Service

```typescript
// apps/server/src/features/canvas/canvas-service.ts
export type CanvasService = {
  getCanvas(user: AuthenticatedUser, canvasId: string): Promise<CanvasDetail>;
  saveCanvasContent(user: AuthenticatedUser, canvasId: string, content: CanvasContent): Promise<void>;
};
```

## Frontend Components

### Canvas Page Route

`/projects/[projectId]/canvas/[canvasId]` — loads canvas data, renders Excalidraw.

Alternatively, simplified: `/canvas/[canvasId]` — since canvas ID is globally unique.

Decision: Use `/canvas/[canvasId]` for simplicity. The project context can be derived from the canvas's project_id on the server side.

### CanvasEditor Component

```typescript
// apps/web/src/components/canvas-editor.tsx
"use client";

// Dynamic import Excalidraw (large bundle, client-only)
const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then(m => m.Excalidraw), { ssr: false });
```

Features:
- Loads canvas content from server on mount
- Renders Excalidraw with Loomic theme (dark/light)
- Auto-saves on change (debounced 1500ms)
- Stores Excalidraw API ref for external manipulation

### Theme Integration

Map Loomic's Tailwind theme to Excalidraw's theme prop:
- Dark mode → `theme="dark"`
- Light mode → `theme="light"`
- Custom CSS overrides for background color matching

### Navigation

From projects page, clicking a project opens its primary canvas:
- Projects list already has `primaryCanvas.id` in the response
- Link: `/canvas/{primaryCanvas.id}`

## File Structure

```
apps/web/src/
├── app/
│   └── canvas/
│       └── [canvasId]/
│           └── page.tsx          ← Canvas page (dynamic route)
├── components/
│   └── canvas-editor.tsx         ← Excalidraw wrapper
├── lib/
│   └── server-api.ts            ← Updated: add canvas API functions

apps/server/src/
├── features/
│   └── canvas/
│       ├── canvas-service.ts     ← Canvas business logic
│       └── canvas-routes.ts      ← Fastify route handlers

supabase/migrations/
└── 20260323000004_canvas_content.sql  ← Schema migration
```

## Testing Strategy

- **Canvas service unit tests:** Mock Supabase client, verify query construction and error handling
- **Canvas route tests:** Mock service, verify HTTP status codes and response shapes
- **Frontend tests:** Mock API calls, verify Excalidraw renders and auto-save triggers
- **Shared types tests:** Verify Zod schema validation

## Scope Exclusions (Phase 2+)

- Binary file storage (images pasted onto canvas → Supabase Storage)
- Image/video generation → canvas placement (requires real-time events)
- Video element overlay rendering
- Canvas export (PNG, ZIP)
- Pop-bar / magic generation menu
- Multi-user collaboration
- Canvas versioning / undo history beyond Excalidraw's built-in
