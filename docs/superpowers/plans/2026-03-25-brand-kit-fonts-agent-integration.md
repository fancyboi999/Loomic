# Brand Kit Fonts + Agent Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Fonts picker to brand kit editor, project ↔ brand kit binding on canvas page, and conditional agent tool for brand kit queries.

**Architecture:** Three independent layers built sequentially. Layer 1 enhances the brand kit editor with a Google Fonts picker. Layer 2 adds project-level brand kit binding via a canvas dropdown. Layer 3 registers a `get_brand_kit` tool on the agent conditionally based on binding state. Each layer builds on existing CRUD infrastructure — no new DB migrations needed.

**Tech Stack:** Google Fonts API, Next.js, Hono, deepagents/LangGraph, Supabase, Zod

**Spec:** `docs/superpowers/specs/2026-03-25-brand-kit-fonts-and-agent-integration-design.md`

---

## File Map

### Layer 1 — Google Fonts Picker
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/shared/src/brand-kit-contracts.ts` | Add `metadata` to create/update request schemas |
| Modify | `apps/server/src/features/brand-kit/brand-kit-service.ts` | Pass `metadata` through to insert/update |
| Create | `apps/server/src/http/fonts.ts` | `GET /api/fonts` — Google Fonts API proxy with cache |
| Modify | `apps/server/src/app.ts` | Register fonts route |
| Modify | `apps/server/src/config/env.ts` | Add `GOOGLE_FONTS_API_KEY` env var |
| Create | `apps/web/src/components/brand-kit/font-picker-dialog.tsx` | Modal dialog: search, category filter, font list with preview |
| Modify | `apps/web/src/components/brand-kit/font-section.tsx` | Replace inline add with dropdown menu (library / manual), render fonts with Google Fonts CSS |
| Modify | `apps/web/src/components/brand-kit/brand-kit-editor.tsx` | Update `onAddFont` signature to accept structured font data |
| Modify | `apps/web/src/components/brand-kit/brand-kit-page.tsx` | Update `handleAddAsset` to pass metadata |
| Create | `apps/web/src/lib/font-api.ts` | Client fetch for `/api/fonts` |

### Layer 2 — Project ↔ Brand Kit Binding
| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/lib/server-api.ts` | Add `updateProject()` and `fetchBrandKits()` client functions |
| Create | `apps/web/src/components/brand-kit-selector.tsx` | Canvas top-bar dropdown for binding brand kit to project |
| Modify | `apps/web/src/app/canvas/page.tsx` | Fetch project + brand kits, render `BrandKitSelector` |

### Layer 3 — Agent Brand Kit Tool
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/server/src/agent/tools/brand-kit.ts` | `get_brand_kit` tool implementation |
| Modify | `apps/server/src/agent/tools/index.ts` | Conditional registration of brand kit tool |
| Modify | `apps/server/src/agent/deep-agent.ts` | Accept + pass `brandKitId` option |
| Modify | `apps/server/src/agent/runtime.ts` | Resolve `brandKitId` from canvas → project → brand_kit_id |
| Modify | `apps/server/src/agent/prompts/loomic-main.ts` | Add brand kit hint when tool is registered |

---

## Layer 1: Google Fonts Picker

### Task 1: Add metadata to shared schemas

**Files:**
- Modify: `packages/shared/src/brand-kit-contracts.ts:64-78`

- [ ] **Step 1: Add `metadata` to `brandKitAssetCreateRequestSchema`**

In `packages/shared/src/brand-kit-contracts.ts`, add `metadata` field:

```typescript
export const brandKitAssetCreateRequestSchema = z.object({
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string().min(1).max(100),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(), // NEW
});
```

- [ ] **Step 2: Add `metadata` to `brandKitAssetUpdateRequestSchema`**

```typescript
export const brandKitAssetUpdateRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(), // NEW
});
```

- [ ] **Step 3: Verify build**

Run: `npx turbo run build --filter=@loomic/shared`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/brand-kit-contracts.ts
git commit -m "feat: add metadata field to brand kit asset create/update schemas"
```

---

### Task 2: Pass metadata through server service

**Files:**
- Modify: `apps/server/src/features/brand-kit/brand-kit-service.ts`

- [ ] **Step 1: Update `createAsset` to include metadata in insert**

In `brand-kit-service.ts`, find the `createAsset` method's `.insert()` call. Add `metadata` to the insert payload:

```typescript
const { data: asset, error } = await client
  .from("brand_kit_assets")
  .insert({
    kit_id: kitId,
    asset_type: input.asset_type,
    display_name: input.display_name,
    text_content: input.text_content ?? null,
    role: input.role ?? null,
    sort_order: nextSortOrder,
    metadata: input.metadata ?? {}, // NEW
  })
  // ... rest unchanged
```

- [ ] **Step 2: Update `updateAsset` to include metadata in update payload**

In the `updateAsset` method, add metadata handling alongside existing fields:

```typescript
if (input.metadata !== undefined) payload.metadata = input.metadata;
```

- [ ] **Step 3: Verify build**

Run: `npx turbo run build --filter=@loomic/server`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/features/brand-kit/brand-kit-service.ts
git commit -m "feat: pass metadata through brand kit asset create/update"
```

---

### Task 3: Server Google Fonts endpoint

**Files:**
- Create: `apps/server/src/http/fonts.ts`
- Modify: `apps/server/src/config/env.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Add `GOOGLE_FONTS_API_KEY` to env config**

In `apps/server/src/config/env.ts`, add to the env schema:

```typescript
googleFontsApiKey: z.string().optional().default(""),
```

And the mapping from `process.env`:

```typescript
googleFontsApiKey: process.env.GOOGLE_FONTS_API_KEY ?? "",
```

- [ ] **Step 2: Create fonts route handler**

Create `apps/server/src/http/fonts.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../config/env.js";

type GoogleFontItem = {
  family: string;
  category: string;
  variants: string[];
};

type FontsCache = {
  fonts: GoogleFontItem[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let fontsCache: FontsCache | null = null;

async function loadGoogleFonts(apiKey: string): Promise<GoogleFontItem[]> {
  if (!apiKey) return [];

  const url = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Google Fonts API error: ${res.status}`);
    return fontsCache?.fonts ?? [];
  }

  const data = (await res.json()) as { items: Array<{ family: string; category: string; variants: string[] }> };
  return (data.items ?? []).map((item) => ({
    family: item.family,
    category: item.category,
    variants: item.variants,
  }));
}

async function getCachedFonts(apiKey: string): Promise<GoogleFontItem[]> {
  if (fontsCache && Date.now() - fontsCache.fetchedAt < CACHE_TTL_MS) {
    return fontsCache.fonts;
  }
  const fonts = await loadGoogleFonts(apiKey);
  if (fonts.length > 0) {
    fontsCache = { fonts, fetchedAt: Date.now() };
  }
  return fonts;
}

export function registerFontsRoutes(
  app: FastifyInstance,
  options: { env: ServerEnv },
) {
  app.get("/api/fonts", async (request, reply) => {
    const { search, category } = request.query as {
      search?: string;
      category?: string;
    };

    let fonts = await getCachedFonts(options.env.googleFontsApiKey);

    if (search) {
      const q = search.toLowerCase();
      fonts = fonts.filter((f) => f.family.toLowerCase().includes(q));
    }
    if (category) {
      fonts = fonts.filter((f) => f.category === category);
    }

    return reply.send({ fonts });
  });
}
```

- [ ] **Step 3: Register fonts route in app.ts**

In `apps/server/src/app.ts`, import and register:

```typescript
import { registerFontsRoutes } from "./http/fonts.js";
// ... in the setup function:
registerFontsRoutes(app, { env });
```

- [ ] **Step 4: Add API key to `.env.local`**

In `apps/server/.env.local`, add:
```
GOOGLE_FONTS_API_KEY=<get-from-google-cloud-console>
```

- [ ] **Step 5: Verify build**

Run: `npx turbo run build --filter=@loomic/server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http/fonts.ts apps/server/src/config/env.ts apps/server/src/app.ts
git commit -m "feat: add GET /api/fonts endpoint with Google Fonts API proxy and 24h cache"
```

---

### Task 4: Client font API + Font picker dialog

**Files:**
- Create: `apps/web/src/lib/font-api.ts`
- Create: `apps/web/src/components/brand-kit/font-picker-dialog.tsx`

- [ ] **Step 1: Create client font API**

Create `apps/web/src/lib/font-api.ts`:

```typescript
const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_BASE_URL ?? "http://127.0.0.1:3001";

export type GoogleFontItem = {
  family: string;
  category: string;
  variants: string[];
};

export async function fetchGoogleFonts(
  accessToken: string,
  search?: string,
  category?: string,
): Promise<GoogleFontItem[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);

  const url = `${SERVER_BASE_URL}/api/fonts?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { fonts: GoogleFontItem[] };
  return data.fonts;
}
```

- [ ] **Step 2: Create font picker dialog component**

Create `apps/web/src/components/brand-kit/font-picker-dialog.tsx`:

The dialog should have:
- Search input (debounced 300ms with `useRef` timer)
- Category filter: dropdown with options 全部 / sans-serif / serif / display / handwriting / monospace
- Scrollable list of fonts, each rendered in its own typeface via `<link>` injected for visible fonts
- Single selection with highlight
- "取消" / "添加" footer buttons
- On add: calls `onSelect({ family, variant, category })` callback

Key implementation notes:
- Use intersection observer or simple scroll-based loading for font CSS (only load `@import` for visible fonts)
- Each font row shows the font name rendered in that font: inject a `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=FontName&display=swap">` dynamically
- Limit initial render to first 50 fonts, load more on scroll
- Dialog uses fixed overlay with `z-50`, backdrop click to close

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GoogleFontItem } from "../../lib/font-api";
import { fetchGoogleFonts } from "../../lib/font-api";

interface FontPickerDialogProps {
  accessToken: string;
  open: boolean;
  onClose: () => void;
  onSelect: (font: { family: string; variant: string; category: string }) => void;
}

const CATEGORIES = [
  { value: "", label: "全部字体" },
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "display", label: "Display" },
  { value: "handwriting", label: "Handwriting" },
  { value: "monospace", label: "Monospace" },
];

const PAGE_SIZE = 50;

export function FontPickerDialog({
  accessToken,
  open,
  onClose,
  onSelect,
}: FontPickerDialogProps) {
  const [fonts, setFonts] = useState<GoogleFontItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<GoogleFontItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadedFamilies, setLoadedFamilies] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch fonts on open / search / category change
  useEffect(() => {
    if (!open) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const result = await fetchGoogleFonts(accessToken, search || undefined, category || undefined);
      setFonts(result);
      setVisibleCount(PAGE_SIZE);
    }, search ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [open, search, category, accessToken]);

  // Load font CSS for visible items
  const ensureFontLoaded = useCallback((family: string) => {
    setLoadedFamilies((prev) => {
      if (prev.has(family)) return prev;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
      document.head.appendChild(link);
      const next = new Set(prev);
      next.add(family);
      return next;
    });
  }, []);

  // Scroll handler for loading more
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, fonts.length));
    }
  }, [fonts.length]);

  const handleAdd = useCallback(() => {
    if (!selected) return;
    onSelect({
      family: selected.family,
      variant: selected.variants.includes("regular") ? "regular" : selected.variants[0] ?? "400",
      category: selected.category,
    });
    onClose();
  }, [selected, onSelect, onClose]);

  if (!open) return null;

  const visibleFonts = fonts.slice(0, visibleCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-[420px] max-h-[520px] bg-white rounded-xl shadow-lg border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-3 border-b">
          <input
            type="text"
            placeholder="搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-1 focus:ring-black/10"
          />
        </div>

        {/* Category filter */}
        <div className="px-3 py-2 border-b">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm bg-transparent outline-none cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Font list */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0"
        >
          {visibleFonts.map((font) => {
            ensureFontLoaded(font.family);
            return (
              <button
                key={font.family}
                type="button"
                onClick={() => setSelected(font)}
                className={`w-full px-4 py-2 text-left text-base hover:bg-neutral-50 cursor-pointer ${
                  selected?.family === font.family ? "bg-neutral-100" : ""
                }`}
                style={{ fontFamily: `"${font.family}", sans-serif` }}
              >
                {font.family}
              </button>
            );
          })}
          {fonts.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {search ? "未找到匹配字体" : "加载中..."}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm border rounded-lg hover:bg-neutral-50 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selected}
            className="px-4 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/font-api.ts apps/web/src/components/brand-kit/font-picker-dialog.tsx
git commit -m "feat: add font picker dialog with Google Fonts search and preview"
```

---

### Task 5: Update FontSection with picker integration and real font rendering

**Files:**
- Modify: `apps/web/src/components/brand-kit/font-section.tsx`
- Modify: `apps/web/src/components/brand-kit/brand-kit-editor.tsx`
- Modify: `apps/web/src/components/brand-kit/brand-kit-page.tsx`

- [ ] **Step 1: Update `FontSectionProps` and add font picker trigger**

Rewrite `font-section.tsx`:
- Replace the `onAddFont: (name: string) => void` prop with `onAddFont: (data: { family: string; variant: string; category: string }) => void`
- Replace the inline text input with a dropdown menu on "+" click: "从字体库选择" / "上传字体文件"
- "从字体库选择" opens `FontPickerDialog`
- Render each font card's "Ag" text using the font's `text_content` (family name) via Google Fonts CSS
- Add `<link>` elements dynamically for each font's family
- Keep delete and rename functionality unchanged
- Add `accessToken` prop (needed for font API calls)

- [ ] **Step 2: Update brand-kit-editor.tsx**

Change `handleAddFont` to accept structured data and pass through to `onAddAsset`:

```typescript
const handleAddFont = useCallback(
  (data: { family: string; variant: string; category: string }) => {
    const weight = data.variant === "regular" ? "400" : data.variant;
    const displayName = `${data.family} ${weight === "400" ? "Regular" : weight}`;
    onAddAsset("font", displayName, data.family, {
      weight,
      category: data.category,
      source: "google_fonts",
    });
  },
  [onAddAsset],
);
```

Update `onAddAsset` type signature to accept `metadata` parameter.

- [ ] **Step 3: Update brand-kit-page.tsx**

Change `handleAddAsset` to pass metadata to `createBrandKitAsset`:

```typescript
const handleAddAsset = useCallback(
  async (
    type: BrandKitAssetType,
    displayName: string,
    textContent?: string | null,
    metadata?: Record<string, unknown>,
  ) => {
    // ... existing setup ...
    await createBrandKitAsset(getToken(), kit.id, {
      asset_type: type,
      display_name: displayName,
      text_content: textContent ?? null,
      metadata, // NEW
    });
    await loadKitDetail(kit.id);
  },
  [getToken, handleAuthError, loadKitDetail],
);
```

- [ ] **Step 4: Verify build**

Run: `npx turbo run build --filter=@loomic/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/brand-kit/font-section.tsx \
  apps/web/src/components/brand-kit/brand-kit-editor.tsx \
  apps/web/src/components/brand-kit/brand-kit-page.tsx
git commit -m "feat: integrate font picker with brand kit editor and real font rendering"
```

---

## Layer 2: Project ↔ Brand Kit Binding

### Task 6: Client API for project update and brand kit list

**Files:**
- Modify: `apps/web/src/lib/server-api.ts`

- [ ] **Step 1: Add `updateProject` function**

```typescript
export async function updateProject(
  accessToken: string,
  projectId: string,
  data: { brand_kit_id?: string | null },
): Promise<void> {
  const res = await fetch(`${SERVER_BASE_URL}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    if (res.status === 401) throw new ApiAuthError("Unauthorized");
    throw new Error(`Failed to update project: ${res.status}`);
  }
}
```

- [ ] **Step 2: Add `fetchBrandKits` function (if not already present)**

Check if `fetchBrandKits` exists. If not, add:

```typescript
export async function fetchBrandKits(
  accessToken: string,
): Promise<{ brandKits: Array<{ id: string; name: string; cover_url: string | null }> }> {
  const res = await fetch(`${SERVER_BASE_URL}/api/brand-kits`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new ApiAuthError("Unauthorized");
    throw new Error(`Failed to fetch brand kits: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/server-api.ts
git commit -m "feat: add updateProject and fetchBrandKits client API functions"
```

---

### Task 7: Brand Kit Selector component

**Files:**
- Create: `apps/web/src/components/brand-kit-selector.tsx`

- [ ] **Step 1: Create BrandKitSelector component**

Create `apps/web/src/components/brand-kit-selector.tsx`:

The component should:
- Accept props: `accessToken`, `projectId`, `currentBrandKitId`, `onBrandKitChange`
- Fetch brand kit list on mount via `fetchBrandKits`
- Render a dropdown trigger: small pill showing current kit name or "品牌套件: 无"
- Dropdown panel: "无" option (unbind) + list of kits with name and small thumbnail
- Checkmark on currently active kit
- On select: call `updateProject(accessToken, projectId, { brand_kit_id: kitId })` then `onBrandKitChange(kitId)`
- Click outside to close
- Position: absolute dropdown below trigger

Styling: Match the Loomic logo pill style — `rounded-xl bg-white/80 backdrop-blur-sm border border-black/[0.06] shadow-sm`

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/brand-kit-selector.tsx
git commit -m "feat: add BrandKitSelector dropdown for canvas page"
```

---

### Task 8: Integrate BrandKitSelector into canvas page

**Files:**
- Modify: `apps/web/src/app/canvas/page.tsx`

- [ ] **Step 1: Fetch project data and brand kit list**

In `CanvasPageContent`, after canvas data loads:
- Add state: `brandKitId` (from project), `brandKits` (list for dropdown)
- After `fetchCanvas` resolves and we have `projectId`, fetch the project to get `brand_kit_id`
- Fetch brand kit list for the dropdown

Note: The project fetch can reuse data from the canvas endpoint if it includes `brand_kit_id`. Check `fetchCanvas` response. If it doesn't include `brand_kit_id`, add a separate `fetch` to `GET /api/projects/{projectId}` (may need a new server endpoint or modify the canvas response to include it).

The simplest approach: the canvas response already includes `projectId`. Add a lightweight project fetch after canvas loads:

```typescript
// After canvas loads and we have projectId
const projectRes = await fetch(`${SERVER_BASE_URL}/api/projects/${c.projectId}`, {
  headers: { Authorization: `Bearer ${token}` },
});
// Extract brand_kit_id from project data
```

Alternatively, modify `fetchCanvas` on the server to include `brand_kit_id` from the project join — this is cleaner. Check the server canvas endpoint and add a join.

- [ ] **Step 2: Render BrandKitSelector in canvas top bar**

Place `BrandKitSelector` next to the Loomic logo link, passing:
- `accessToken`
- `projectId` from canvas data
- `currentBrandKitId` from project data
- `onBrandKitChange` callback that updates local state

```tsx
<BrandKitSelector
  accessToken={accessToken}
  projectId={canvasData.projectId}
  currentBrandKitId={brandKitId}
  onBrandKitChange={(kitId) => setBrandKitId(kitId)}
/>
```

- [ ] **Step 3: Verify build and test manually**

Run: `npx turbo run build --filter=@loomic/web`
Expected: PASS

Manual test: Open a canvas, verify the brand kit dropdown appears, selecting a kit persists to the project.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/canvas/page.tsx
git commit -m "feat: add brand kit selector to canvas page top bar"
```

---

## Layer 3: Agent Brand Kit Tool

### Task 9: Create get_brand_kit tool

**Files:**
- Create: `apps/server/src/agent/tools/brand-kit.ts`

- [ ] **Step 1: Implement the tool**

Create `apps/server/src/agent/tools/brand-kit.ts`:

```typescript
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";

export function createBrandKitTool(
  deps: { createUserClient: (accessToken: string) => any },
  brandKitId: string,
) {
  return new DynamicStructuredTool({
    name: "get_brand_kit",
    description:
      "查询当前项目绑定的品牌套件信息，包含设计指南、颜色、字体、Logo等品牌资产。当用户提到品牌、风格、设计规范时使用此工具。",
    schema: z.object({}),
    func: async (_input, runManager) => {
      const config = runManager?.getChild()?.parentConfig ?? {};
      const accessToken = (config as any)?.configurable?.access_token;
      if (!accessToken) {
        return JSON.stringify({ error: "No access token available" });
      }

      const client = deps.createUserClient(accessToken);

      // Fetch kit
      const { data: kit } = await client
        .from("brand_kits")
        .select("id, name, guidance_text")
        .eq("id", brandKitId)
        .maybeSingle();

      if (!kit) {
        return JSON.stringify({ error: "Brand kit not found" });
      }

      // Fetch assets
      const { data: assets } = await client
        .from("brand_kit_assets")
        .select("asset_type, display_name, role, text_content, file_url, metadata")
        .eq("kit_id", brandKitId)
        .order("sort_order", { ascending: true });

      const safeAssets = assets ?? [];

      const result = {
        kit_name: kit.name,
        design_guidance: kit.guidance_text ?? "",
        colors: safeAssets
          .filter((a: any) => a.asset_type === "color")
          .map((a: any) => ({
            name: a.display_name,
            hex: a.text_content,
            role: a.role,
          })),
        fonts: safeAssets
          .filter((a: any) => a.asset_type === "font")
          .map((a: any) => ({
            name: a.display_name,
            family: a.text_content,
            weight: (a.metadata as any)?.weight ?? "400",
            role: a.role,
          })),
        logos: safeAssets
          .filter((a: any) => a.asset_type === "logo")
          .map((a: any) => ({
            name: a.display_name,
            url: a.file_url,
            role: a.role,
          })),
        images: safeAssets
          .filter((a: any) => a.asset_type === "image")
          .map((a: any) => ({
            name: a.display_name,
            url: a.file_url,
          })),
      };

      return JSON.stringify(result, null, 2);
    },
  });
}
```

Note: The tool accesses `access_token` from LangGraph's configurable context (passed through `streamEvents` options). Check how `inspect-canvas.ts` accesses it — follow the same pattern exactly.

- [ ] **Step 2: Verify build**

Run: `npx turbo run build --filter=@loomic/server`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/tools/brand-kit.ts
git commit -m "feat: add get_brand_kit agent tool for querying bound brand kit"
```

---

### Task 10: Conditional tool registration

**Files:**
- Modify: `apps/server/src/agent/tools/index.ts`
- Modify: `apps/server/src/agent/deep-agent.ts`

- [ ] **Step 1: Update `createMainAgentTools` to accept `brandKitId`**

In `apps/server/src/agent/tools/index.ts`:

```typescript
import { createBrandKitTool } from "./brand-kit.js";

export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;
  },
) {
  const tools = [
    createProjectSearchTool(backend),
    createInspectCanvasTool(deps),
  ];
  if (deps.brandKitId) {
    tools.push(createBrandKitTool(deps, deps.brandKitId));
  }
  return tools;
}
```

Note: The `as const` return type needs to be removed since we're now using a mutable array with conditional push. Change return to plain array.

- [ ] **Step 2: Update `createLoomicDeepAgent` to accept and pass `brandKitId`**

In `apps/server/src/agent/deep-agent.ts`:

Add `brandKitId?: string | null` to the options type:

```typescript
export type LoomicAgentFactory = (options: {
  brandKitId?: string | null;  // NEW
  canvasId?: string;
  // ... rest unchanged
}) => LoomicAgent;
```

And in `createLoomicDeepAgent`:

```typescript
export function createLoomicDeepAgent(options: {
  brandKitId?: string | null;  // NEW
  // ... rest unchanged
}): LoomicAgent {
  // ... existing setup ...

  const systemPrompt = options.brandKitId
    ? LOOMIC_SYSTEM_PROMPT + "\n\n当前项目已绑定品牌套件。在进行设计相关工作时，请先使用 get_brand_kit 工具查询品牌信息，确保设计符合品牌规范。"
    : LOOMIC_SYSTEM_PROMPT;

  return createDeepAgent({
    // ... existing ...
    systemPrompt,
    tools: createMainAgentTools(backendFactory, {
      createUserClient,
      brandKitId: options.brandKitId,  // NEW
    }),
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx turbo run build --filter=@loomic/server`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/agent/tools/index.ts apps/server/src/agent/deep-agent.ts
git commit -m "feat: conditionally register brand kit tool based on project binding"
```

---

### Task 11: Resolve brandKitId in runtime

**Files:**
- Modify: `apps/server/src/agent/runtime.ts`

- [ ] **Step 1: Add brand kit ID resolution before agent creation**

In `runtime.ts`, inside `streamRun()`, before the `resolvedAgentFactory(...)` call (~line 228), add a lookup:

```typescript
// Resolve brand kit ID from canvas → project → brand_kit_id
let brandKitId: string | null = null;
if (run.canvasId && run.accessToken && options.createUserClient) {
  try {
    const client = options.createUserClient(run.accessToken) as any;
    const { data: canvas } = await client
      .from("canvases")
      .select("project_id")
      .eq("id", run.canvasId)
      .maybeSingle();

    if (canvas?.project_id) {
      const { data: project } = await client
        .from("projects")
        .select("brand_kit_id")
        .eq("id", canvas.project_id)
        .maybeSingle();
      brandKitId = project?.brand_kit_id ?? null;
    }
  } catch (err) {
    console.warn("Failed to resolve brand kit ID:", err);
  }
}
```

- [ ] **Step 2: Pass `brandKitId` to agent factory**

Update the `resolvedAgentFactory` call to include `brandKitId`:

```typescript
agent = resolvedAgentFactory({
  ...(brandKitId ? { brandKitId } : {}),  // NEW
  ...(run.canvasId ? { canvasId: run.canvasId } : {}),
  // ... rest unchanged
});
```

- [ ] **Step 3: Verify build**

Run: `npx turbo run build --filter=@loomic/server`
Expected: PASS

- [ ] **Step 4: E2E verification**

Start dev servers. In the canvas:
1. Bind a brand kit to the project via the dropdown
2. Open chat, ask "看得到我的品牌kit吗？"
3. Agent should use `get_brand_kit` tool and return structured brand kit info
4. Unbind the brand kit
5. Start a new chat session, ask the same question
6. Agent should NOT have the tool — responds that no brand kit is bound

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/agent/runtime.ts
git commit -m "feat: resolve brand kit ID from project binding and pass to agent factory"
```
