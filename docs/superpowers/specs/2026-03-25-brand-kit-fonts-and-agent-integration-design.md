# Design Spec: Brand Kit Fonts + Agent Integration

## Overview

Three-layer feature: (1) Google Fonts picker for brand kit editor, (2) project ↔ brand kit binding UI, (3) conditional agent tool for brand kit queries.

## Layer 1: Google Fonts Picker

### Goal
Replace the current manual text input for fonts with a Google Fonts-backed picker dialog (search, category filter, live preview).

### Data Model Changes

Extend font asset storage — use existing `brand_kit_assets` fields:
- `display_name`: Full display label, e.g. "Inter Regular"
- `text_content`: Google Fonts family name, e.g. "Inter" (used for CSS loading + AI context)
- `metadata`: `{ "weight": "400", "category": "sans-serif", "source": "google_fonts" }`

No migration needed — fields already exist.

### Server: Google Fonts List Endpoint

**`GET /api/fonts?search=&category=`**

- Server-side cache of Google Fonts API response (TTL: 24h, in-memory or file)
- Google Fonts API key stored in server `.env.local` as `GOOGLE_FONTS_API_KEY`
- Response shape:
```json
{
  "fonts": [
    { "family": "Inter", "category": "sans-serif", "variants": ["400","500","600","700"] },
    { "family": "Roboto", "category": "sans-serif", "variants": ["300","400","500","700"] }
  ]
}
```
- Server filters by `search` (case-insensitive substring) and `category` (exact match)
- Categories: `sans-serif`, `serif`, `display`, `handwriting`, `monospace`

### Frontend: Font Picker Dialog

**Trigger**: Click "+" in FontSection → dropdown menu:
- "从字体库选择" → opens FontPickerDialog
- "上传字体文件" → existing add flow (text input, future: file upload)

**FontPickerDialog** component:
- Search input (debounced 300ms)
- Category filter dropdown: 全部 / Sans-serif / Serif / Display / Handwriting / Monospace
- Scrollable font list (virtual scroll for ~1600 items)
- Each row: font name rendered in its own font via dynamic `@font-face` (load from `fonts.googleapis.com/css2?family={name}`)
- Only load fonts visible in viewport (intersection observer or virtual list)
- Click to select (single selection, highlighted)
- "取消" / "添加" buttons at bottom

**Font Preview Cards** in FontSection:
- Existing "Ag" preview, but rendered in the actual font
- Load via `<link href="https://fonts.googleapis.com/css2?family={text_content}&display=swap">`
- Lazy load — only load fonts for visible cards

### API Flow for Adding a Font

1. User selects "Inter 400" in picker → clicks "添加"
2. Frontend calls `POST /api/brand-kits/{kitId}/assets` with:
   ```json
   {
     "asset_type": "font",
     "display_name": "Inter Regular",
     "text_content": "Inter",
     "metadata": { "weight": "400", "category": "sans-serif", "source": "google_fonts" }
   }
   ```
3. Existing CRUD pipeline handles storage — no API changes needed
4. Note: `brandKitAssetCreateRequestSchema` needs `metadata` field added

### Schema Changes (shared types)

Add `metadata` to `brandKitAssetCreateRequestSchema`:
```typescript
export const brandKitAssetCreateRequestSchema = z.object({
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string().min(1).max(100),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(), // NEW
});
```

Add `metadata` to `brandKitAssetUpdateRequestSchema` as well.

Server service `createAsset` must pass `metadata` through to insert.

---

## Layer 2: Project ↔ Brand Kit Binding

### Goal
Let users bind a brand kit to a project from the canvas page. The binding persists in `projects.brand_kit_id` (FK already exists).

### Server API

**`PATCH /api/projects/:projectId`** — already exists for project updates.

Add `brand_kit_id` to the update schema:
```typescript
// In project update request schema
brand_kit_id: z.string().uuid().nullable().optional()
```

**`GET /api/projects/:projectId`** — already returns project data.

Ensure response includes `brand_kit_id`.

**`GET /api/brand-kits`** — already exists, returns user's kits.

Used by the canvas dropdown to list available brand kits.

### Frontend: Canvas Brand Kit Selector

**Location**: Canvas page top bar, near the project name / Loomic logo area.

**UI Component** `BrandKitSelector`:
- Small dropdown trigger showing current kit name (or "品牌套件: 无")
- Dropdown panel:
  - "无" option (unbind) — with checkmark if no kit bound
  - List of user's brand kits — thumbnail + name, checkmark on active
- On select: `PATCH /api/projects/{projectId}` with `{ brand_kit_id: kitId | null }`
- Optimistic UI update

**Data flow**:
- Canvas page already fetches canvas data (includes `projectId`)
- Need to also fetch project data to get current `brand_kit_id`
- Need to fetch user's brand kit list for dropdown
- Can use existing `fetchBrandKits` API

---

## Layer 3: Agent Brand Kit Tool

### Goal
When a project has a bound brand kit, register a `get_brand_kit` tool for the agent. When unbound, the tool is absent.

### Tool Definition

**`get_brand_kit`** — Read-only tool, returns structured brand kit data.

```typescript
{
  name: "get_brand_kit",
  description: "查询当前项目绑定的品牌套件信息，包含设计指南、颜色、字体、Logo等品牌资产。当用户提到品牌、风格、设计规范时使用此工具。",
  schema: z.object({}), // No input parameters needed
  invoke: async (_, config) => {
    // Read brandKitId from config.configurable
    // Fetch kit + assets via Supabase
    // Return structured JSON
  }
}
```

**Return shape**:
```json
{
  "kit_name": "My Brand Kit",
  "design_guidance": "Human: A brand built on shared understanding...",
  "colors": [
    { "name": "Cloud", "hex": "#F0F0F0", "role": "primary" }
  ],
  "fonts": [
    { "name": "Inter Regular", "family": "Inter", "weight": "400", "role": "body" }
  ],
  "logos": [
    { "name": "Primary Logo", "url": "https://...", "role": "primary" }
  ],
  "images": [
    { "name": "Hero Image", "url": "https://..." }
  ]
}
```

### Conditional Registration

**In `createMainAgentTools()`**: Accept optional `brandKitId` parameter.

```typescript
export function createMainAgentTools(
  backend: BackendProtocol | BackendFactory,
  deps: {
    createUserClient: (accessToken: string) => any;
    brandKitId?: string | null;  // NEW
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

**In `deep-agent.ts`** (`createLoomicAgent`): Pass `brandKitId` through.

**In `runtime.ts`** (`streamRun`): Before creating the agent, resolve `brandKitId`:
1. Run has `canvasId` → query canvas → get `projectId` → query project → get `brand_kit_id`
2. Pass `brandKitId` to agent factory
3. If `brand_kit_id` is null → tool not registered → agent doesn't know about brand kits

### System Prompt Enhancement

When brand kit tool is registered, append to system prompt:
```
当前项目已绑定品牌套件。在进行设计时，请先使用 get_brand_kit 工具查询品牌信息，确保设计符合品牌规范。
```

---

## Implementation Priority

1. **Layer 1** (Google Fonts picker) — standalone, no dependencies
2. **Layer 2** (Project binding) — needs project PATCH API update + canvas UI
3. **Layer 3** (Agent tool) — needs Layer 2 complete, builds on existing tool system

## Non-Goals

- Font file hosting/CDN (use Google Fonts CDN directly)
- Font rendering in AI-generated images (AI models handle font references in prompts)
- User-uploaded custom font files (future phase)
- Brand kit sharing across users/teams (future phase)
