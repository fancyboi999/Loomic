# Brand Kit Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Brand Kit feature — a full-page editor at `/brand-kit` with left sidebar (kit list), right editor area (guidance, colors, fonts), complete CRUD API, and database schema. Pixel-level visual alignment with Lovart's Brand Kit page.

**Architecture:** Two-table hybrid model (`brand_kits` + `brand_kit_assets`) with user-level RLS. Fastify service layer + Supabase direct queries. React SPA page with optimistic updates and debounced saves.

**Tech Stack:** Next.js 15 (App Router), Fastify 5, Supabase (PostgreSQL + RLS), Zod, Tailwind CSS 4, shadcn/Base UI, react-colorful, CVA

**Spec:** `docs/superpowers/specs/2026-03-24-brand-kit-design.md`

---

## File Structure

### New Files

```
supabase/migrations/20260325000001_create_brand_kits.sql          — DB schema, RLS, triggers, indexes
packages/shared/src/brand-kit-contracts.ts                         — Zod entity + request/response schemas
apps/server/src/features/brand-kit/brand-kit-service.ts           — Business logic (CRUD, default toggle)
apps/server/src/http/brand-kits.ts                                 — Route handlers for /api/brand-kits/**
apps/web/src/lib/brand-kit-api.ts                                  — Typed fetch client for brand-kit endpoints
apps/web/src/app/brand-kit/page.tsx                                — Next.js route entry
apps/web/src/components/brand-kit/brand-kit-page.tsx               — Orchestrator: sidebar + editor, state mgmt
apps/web/src/components/brand-kit/brand-kit-sidebar.tsx            — Left sidebar: kit list, create button
apps/web/src/components/brand-kit/brand-kit-editor.tsx             — Right editor: header + content sections
apps/web/src/components/brand-kit/guidance-section.tsx             — Auto-resize textarea for design guidance
apps/web/src/components/brand-kit/color-section.tsx                — Color swatches grid + add/edit/delete
apps/web/src/components/brand-kit/color-picker-popover.tsx         — Popover wrapping react-colorful HexColorPicker
apps/web/src/components/brand-kit/font-section.tsx                 — Font name cards (text-only in Phase 1)
apps/web/src/components/brand-kit/logo-section.tsx                 — Placeholder cards (disabled upload in Phase 1)
apps/web/src/components/brand-kit/image-section.tsx                — Placeholder cards (disabled upload in Phase 1)
apps/web/src/components/brand-kit/asset-card.tsx                   — Reusable card for logo/image assets
apps/web/src/components/brand-kit/inline-input.tsx                 — Inline editable input (transparent → dashed on hover)
apps/web/src/components/brand-kit/section-header.tsx               — Reusable section title component
apps/web/src/components/brand-kit/empty-state.tsx                  — Empty state when no kits exist
```

### Modified Files

```
packages/shared/src/index.ts                                       — Add re-export of brand-kit-contracts
packages/shared/src/http.ts                                        — Add brand_kit error codes, projectUpdateRequestSchema
apps/server/src/app.ts                                             — Import + register brand-kit routes + service
apps/server/src/features/projects/project-service.ts               — Add updateProject method (PATCH brand_kit_id)
apps/server/src/http/projects.ts                                   — Add PATCH /api/projects/:projectId route
apps/web/src/components/project-sidebar.tsx                        — Add Brand Kit nav link
apps/web/package.json                                              — Add react-colorful dependency
```

---

## Task 1: Install react-colorful

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install react-colorful in the web app**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm add react-colorful --filter @loomic/web
```

- [ ] **Step 2: Verify installation**

Run: `cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm ls react-colorful --filter @loomic/web`
Expected: `react-colorful` listed with version

- [ ] **Step 3: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add react-colorful dependency for brand kit color picker
EOF
)"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260325000001_create_brand_kits.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Brand Kit feature: tables, enum, triggers, indexes, RLS
-- Depends on: foundation migration (set_updated_at function)

-- Asset type enum
CREATE TYPE public.brand_kit_asset_type AS ENUM ('color', 'font', 'logo', 'image');

-- brand_kits: Kit main table
CREATE TABLE public.brand_kits (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '未命名',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  guidance_text TEXT,
  cover_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- brand_kit_assets: unified asset table
CREATE TABLE public.brand_kit_assets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id        UUID NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  asset_type    public.brand_kit_asset_type NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  text_content  TEXT,
  file_url      TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- projects FK to brand_kits
ALTER TABLE public.projects ADD COLUMN brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL;

-- updated_at triggers (reuse existing set_updated_at from foundation migration)
CREATE TRIGGER brand_kits_updated_at
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER brand_kit_assets_updated_at
  BEFORE UPDATE ON public.brand_kit_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes
CREATE INDEX idx_brand_kits_user ON public.brand_kits(user_id);
CREATE INDEX idx_brand_kit_assets_kit ON public.brand_kit_assets(kit_id);
CREATE INDEX idx_brand_kit_assets_type ON public.brand_kit_assets(kit_id, asset_type);

-- Unique partial index: at most one default kit per user
CREATE UNIQUE INDEX idx_brand_kits_default
  ON public.brand_kits(user_id) WHERE is_default = true;

-- RLS
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_kit_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_kits_user_policy ON public.brand_kits
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY brand_kit_assets_policy ON public.brand_kit_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.brand_kits WHERE id = kit_id AND user_id = auth.uid())
  );
```

- [ ] **Step 2: Push migration to Supabase**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && npx supabase db push
```
Expected: Migration applied successfully. If it fails, check `.env.local` for Supabase credentials and fix issues.

- [ ] **Step 3: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add supabase/migrations/20260325000001_create_brand_kits.sql
git commit -m "$(cat <<'EOF'
feat: add brand_kits and brand_kit_assets tables with RLS
EOF
)"
```

---

## Task 3: Shared Contracts (Zod Schemas)

**Files:**
- Create: `packages/shared/src/brand-kit-contracts.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/http.ts`

- [ ] **Step 1: Create brand-kit-contracts.ts**

Write file `packages/shared/src/brand-kit-contracts.ts`:

```typescript
import { z } from "zod";

// === Entity Schemas ===

export const brandKitAssetTypeSchema = z.enum(["color", "font", "logo", "image"]);
export type BrandKitAssetType = z.infer<typeof brandKitAssetTypeSchema>;

export const brandKitAssetSchema = z.object({
  id: z.string().min(1),
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string(),
  role: z.string().nullable(),
  sort_order: z.number().int(),
  text_content: z.string().nullable(),
  file_url: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitAsset = z.infer<typeof brandKitAssetSchema>;

export const brandKitSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  is_default: z.boolean(),
  cover_url: z.string().nullable(),
  asset_counts: z.object({
    color: z.number().int(),
    font: z.number().int(),
    logo: z.number().int(),
    image: z.number().int(),
  }),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitSummary = z.infer<typeof brandKitSummarySchema>;

export const brandKitDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  is_default: z.boolean(),
  guidance_text: z.string().nullable(),
  cover_url: z.string().nullable(),
  assets: z.array(brandKitAssetSchema),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type BrandKitDetail = z.infer<typeof brandKitDetailSchema>;

// === Request Schemas ===

export const brandKitCreateRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type BrandKitCreateRequest = z.infer<typeof brandKitCreateRequestSchema>;

export const brandKitUpdateRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  guidance_text: z.string().max(5000).nullable().optional(),
  is_default: z.boolean().optional(),
});
export type BrandKitUpdateRequest = z.infer<typeof brandKitUpdateRequestSchema>;

export const brandKitAssetCreateRequestSchema = z.object({
  asset_type: brandKitAssetTypeSchema,
  display_name: z.string().min(1).max(100),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});
export type BrandKitAssetCreateRequest = z.infer<typeof brandKitAssetCreateRequestSchema>;

export const brandKitAssetUpdateRequestSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  text_content: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});
export type BrandKitAssetUpdateRequest = z.infer<typeof brandKitAssetUpdateRequestSchema>;

// === Response Schemas ===

export const brandKitListResponseSchema = z.object({
  brandKits: z.array(brandKitSummarySchema),
});
export type BrandKitListResponse = z.infer<typeof brandKitListResponseSchema>;

export const brandKitDetailResponseSchema = brandKitDetailSchema;
export type BrandKitDetailResponse = z.infer<typeof brandKitDetailResponseSchema>;

export const brandKitAssetResponseSchema = brandKitAssetSchema;
export type BrandKitAssetResponse = z.infer<typeof brandKitAssetResponseSchema>;
```

- [ ] **Step 2: Add re-export to index.ts**

In `packages/shared/src/index.ts`, add this line after the existing exports:

```typescript
export * from "./brand-kit-contracts.js";
```

- [ ] **Step 3: Add error codes and projectUpdateRequestSchema to http.ts**

In `packages/shared/src/http.ts`:

1. Add brand kit error codes to `applicationErrorCodeSchema`. Replace the existing enum with:
```typescript
export const applicationErrorCodeSchema = z.enum([
  "application_error",
  "bootstrap_failed",
  "brand_kit_not_found",
  "brand_kit_create_failed",
  "brand_kit_update_failed",
  "brand_kit_delete_failed",
  "brand_kit_query_failed",
  "brand_kit_asset_not_found",
  "brand_kit_asset_create_failed",
  "canvas_not_found",
  "canvas_save_failed",
  "chat_error",
  "profile_update_failed",
  "project_query_failed",
  "project_create_failed",
  "project_delete_failed",
  "project_not_found",
  "project_slug_taken",
  "project_update_failed",
  "session_not_found",
  "settings_not_found",
  "settings_update_failed",
  "upload_failed",
  "asset_not_found",
]);
```

2. Add at the end of the file (before the final type exports):
```typescript
export const projectUpdateRequestSchema = z.object({
  brand_kit_id: z.string().uuid().nullable().optional(),
});
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>;
```

- [ ] **Step 4: Build shared package to verify**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run build --filter @loomic/shared
```
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add packages/shared/src/brand-kit-contracts.ts packages/shared/src/index.ts packages/shared/src/http.ts
git commit -m "$(cat <<'EOF'
feat: add brand kit Zod contracts and error codes
EOF
)"
```

---

## Task 4: Server — Brand Kit Service

**Files:**
- Create: `apps/server/src/features/brand-kit/brand-kit-service.ts`

- [ ] **Step 1: Create brand-kit-service.ts**

Write file `apps/server/src/features/brand-kit/brand-kit-service.ts`:

```typescript
import type {
  BrandKitAsset,
  BrandKitAssetCreateRequest,
  BrandKitAssetUpdateRequest,
  BrandKitCreateRequest,
  BrandKitDetail,
  BrandKitSummary,
  BrandKitUpdateRequest,
} from "@loomic/shared";

import type {
  AuthenticatedUser,
  UserSupabaseClient,
} from "../../supabase/user.js";

export class BrandKitServiceError extends Error {
  readonly statusCode: number;
  readonly code:
    | "brand_kit_not_found"
    | "brand_kit_create_failed"
    | "brand_kit_update_failed"
    | "brand_kit_delete_failed"
    | "brand_kit_query_failed"
    | "brand_kit_asset_not_found"
    | "brand_kit_asset_create_failed";

  constructor(
    code: BrandKitServiceError["code"],
    message: string,
    statusCode: number,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type BrandKitService = {
  listKits(user: AuthenticatedUser): Promise<BrandKitSummary[]>;
  getKit(user: AuthenticatedUser, kitId: string): Promise<BrandKitDetail>;
  createKit(
    user: AuthenticatedUser,
    input: BrandKitCreateRequest,
  ): Promise<BrandKitDetail>;
  updateKit(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitUpdateRequest,
  ): Promise<BrandKitDetail>;
  deleteKit(user: AuthenticatedUser, kitId: string): Promise<void>;
  createAsset(
    user: AuthenticatedUser,
    kitId: string,
    input: BrandKitAssetCreateRequest,
  ): Promise<BrandKitAsset>;
  updateAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
    input: BrandKitAssetUpdateRequest,
  ): Promise<BrandKitAsset>;
  deleteAsset(
    user: AuthenticatedUser,
    kitId: string,
    assetId: string,
  ): Promise<void>;
};

export function createBrandKitService(options: {
  createUserClient: (accessToken: string) => UserSupabaseClient;
}): BrandKitService {
  return {
    async listKits(user) {
      const client = options.createUserClient(user.accessToken);

      const { data: kits, error } = await client
        .from("brand_kits")
        .select("id, name, is_default, cover_url, created_at, updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        throw new BrandKitServiceError(
          "brand_kit_query_failed",
          "Unable to load brand kits.",
          500,
        );
      }

      if (!kits.length) return [];

      // Count assets per kit per type
      const { data: assets } = await client
        .from("brand_kit_assets")
        .select("kit_id, asset_type")
        .in("kit_id", kits.map((k) => k.id));

      const countMap = new Map<string, Record<string, number>>();
      for (const asset of assets ?? []) {
        const counts = countMap.get(asset.kit_id) ?? { color: 0, font: 0, logo: 0, image: 0 };
        counts[asset.asset_type] = (counts[asset.asset_type] ?? 0) + 1;
        countMap.set(asset.kit_id, counts);
      }

      return kits.map((kit) => ({
        id: kit.id,
        name: kit.name,
        is_default: kit.is_default,
        cover_url: kit.cover_url,
        asset_counts: {
          color: countMap.get(kit.id)?.color ?? 0,
          font: countMap.get(kit.id)?.font ?? 0,
          logo: countMap.get(kit.id)?.logo ?? 0,
          image: countMap.get(kit.id)?.image ?? 0,
        },
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      }));
    },

    async getKit(user, kitId) {
      const client = options.createUserClient(user.accessToken);

      const { data: kit, error } = await client
        .from("brand_kits")
        .select("id, name, is_default, guidance_text, cover_url, created_at, updated_at")
        .eq("id", kitId)
        .maybeSingle();

      if (error || !kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }

      const { data: assets } = await client
        .from("brand_kit_assets")
        .select("*")
        .eq("kit_id", kitId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      return {
        id: kit.id,
        name: kit.name,
        is_default: kit.is_default,
        guidance_text: kit.guidance_text,
        cover_url: kit.cover_url,
        assets: (assets ?? []).map(mapAsset),
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      };
    },

    async createKit(user, input) {
      const client = options.createUserClient(user.accessToken);

      const { data: kit, error } = await client
        .from("brand_kits")
        .insert({
          user_id: user.id,
          name: input.name ?? "未命名",
        })
        .select("id, name, is_default, guidance_text, cover_url, created_at, updated_at")
        .single();

      if (error || !kit) {
        throw new BrandKitServiceError(
          "brand_kit_create_failed",
          "Unable to create brand kit.",
          500,
        );
      }

      return {
        id: kit.id,
        name: kit.name,
        is_default: kit.is_default,
        guidance_text: kit.guidance_text,
        cover_url: kit.cover_url,
        assets: [],
        created_at: kit.created_at,
        updated_at: kit.updated_at,
      };
    },

    async updateKit(user, kitId, input) {
      const client = options.createUserClient(user.accessToken);

      // Handle is_default toggle: clear old default + set new in sequence.
      // The unique partial index (idx_brand_kits_default) prevents two defaults.
      // RLS ensures user_id scoping. If the second update fails, the user
      // ends up with no default — acceptable for Phase 1, and the UI can retry.
      // A Supabase RPC transaction would be ideal but is not strictly required
      // because the partial unique index + single-user access pattern make
      // dual-default impossible.
      if (input.is_default === true) {
        const { error: clearErr } = await client
          .from("brand_kits")
          .update({ is_default: false })
          .eq("user_id", user.id)
          .eq("is_default", true);

        if (clearErr) {
          throw new BrandKitServiceError(
            "brand_kit_update_failed",
            "Unable to clear existing default kit.",
            500,
          );
        }
      }

      const updatePayload: Record<string, unknown> = {};
      if (input.name !== undefined) updatePayload.name = input.name;
      if (input.guidance_text !== undefined) updatePayload.guidance_text = input.guidance_text;
      if (input.is_default !== undefined) updatePayload.is_default = input.is_default;

      const { error } = await client
        .from("brand_kits")
        .update(updatePayload)
        .eq("id", kitId);

      if (error) {
        throw new BrandKitServiceError(
          "brand_kit_update_failed",
          "Unable to update brand kit.",
          500,
        );
      }

      // Return the updated kit with assets
      return this.getKit(user, kitId);
    },

    async deleteKit(user, kitId) {
      const client = options.createUserClient(user.accessToken);

      const { data: existing } = await client
        .from("brand_kits")
        .select("id")
        .eq("id", kitId)
        .maybeSingle();

      if (!existing) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }

      const { error } = await client
        .from("brand_kits")
        .delete()
        .eq("id", kitId);

      if (error) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          "Unable to delete brand kit.",
          500,
        );
      }
    },

    async createAsset(user, kitId, input) {
      const client = options.createUserClient(user.accessToken);

      // Verify kit exists (RLS ensures ownership)
      const { data: kit } = await client
        .from("brand_kits")
        .select("id")
        .eq("id", kitId)
        .maybeSingle();

      if (!kit) {
        throw new BrandKitServiceError(
          "brand_kit_not_found",
          "Brand kit not found.",
          404,
        );
      }

      // Get max sort_order for this kit + type
      const { data: maxRow } = await client
        .from("brand_kit_assets")
        .select("sort_order")
        .eq("kit_id", kitId)
        .eq("asset_type", input.asset_type)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSort = (maxRow?.sort_order ?? -1) + 1;

      const { data: asset, error } = await client
        .from("brand_kit_assets")
        .insert({
          kit_id: kitId,
          asset_type: input.asset_type,
          display_name: input.display_name,
          text_content: input.text_content ?? null,
          role: input.role ?? null,
          sort_order: nextSort,
        })
        .select("*")
        .single();

      if (error || !asset) {
        throw new BrandKitServiceError(
          "brand_kit_asset_create_failed",
          "Unable to create asset.",
          500,
        );
      }

      return mapAsset(asset);
    },

    async updateAsset(user, kitId, assetId, input) {
      const client = options.createUserClient(user.accessToken);

      const updatePayload: Record<string, unknown> = {};
      if (input.display_name !== undefined) updatePayload.display_name = input.display_name;
      if (input.text_content !== undefined) updatePayload.text_content = input.text_content;
      if (input.role !== undefined) updatePayload.role = input.role;
      if (input.sort_order !== undefined) updatePayload.sort_order = input.sort_order;

      const { data: asset, error } = await client
        .from("brand_kit_assets")
        .update(updatePayload)
        .eq("id", assetId)
        .eq("kit_id", kitId)
        .select("*")
        .single();

      if (error || !asset) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          "Asset not found.",
          404,
        );
      }

      return mapAsset(asset);
    },

    async deleteAsset(user, kitId, assetId) {
      const client = options.createUserClient(user.accessToken);

      const { data: existing } = await client
        .from("brand_kit_assets")
        .select("id")
        .eq("id", assetId)
        .eq("kit_id", kitId)
        .maybeSingle();

      if (!existing) {
        throw new BrandKitServiceError(
          "brand_kit_asset_not_found",
          "Asset not found.",
          404,
        );
      }

      const { error } = await client
        .from("brand_kit_assets")
        .delete()
        .eq("id", assetId)
        .eq("kit_id", kitId);

      if (error) {
        throw new BrandKitServiceError(
          "brand_kit_delete_failed",
          "Unable to delete asset.",
          500,
        );
      }
    },
  };
}

function mapAsset(row: {
  id: string;
  asset_type: string;
  display_name: string;
  role: string | null;
  sort_order: number;
  text_content: string | null;
  file_url: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}): BrandKitAsset {
  return {
    id: row.id,
    asset_type: row.asset_type as BrandKitAsset["asset_type"],
    display_name: row.display_name,
    role: row.role,
    sort_order: row.sort_order,
    text_content: row.text_content,
    file_url: row.file_url,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run build --filter @loomic/shared && pnpm exec tsc --noEmit --project apps/server/tsconfig.json 2>&1 | head -20
```
Expected: No type errors related to brand-kit-service.

- [ ] **Step 3: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/server/src/features/brand-kit/brand-kit-service.ts
git commit -m "$(cat <<'EOF'
feat: add brand kit service with CRUD for kits and assets
EOF
)"
```

---

## Task 5: Server — Brand Kit Routes + Registration

**Files:**
- Create: `apps/server/src/http/brand-kits.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Create brand-kits.ts route handler**

Write file `apps/server/src/http/brand-kits.ts`:

```typescript
import type { FastifyInstance, FastifyReply } from "fastify";

import {
  applicationErrorResponseSchema,
  brandKitAssetCreateRequestSchema,
  brandKitAssetResponseSchema,
  brandKitAssetUpdateRequestSchema,
  brandKitCreateRequestSchema,
  brandKitDetailResponseSchema,
  brandKitListResponseSchema,
  brandKitUpdateRequestSchema,
  unauthenticatedErrorResponseSchema,
} from "@loomic/shared";

import {
  BrandKitServiceError,
  type BrandKitService,
} from "../features/brand-kit/brand-kit-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerBrandKitRoutes(
  app: FastifyInstance,
  options: {
    auth: RequestAuthenticator;
    brandKitService: BrandKitService;
  },
) {
  // GET /api/brand-kits — list user's kits
  app.get("/api/brand-kits", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthorized(reply);

      const brandKits = await options.brandKitService.listKits(user);
      return reply.code(200).send(brandKitListResponseSchema.parse({ brandKits }));
    } catch (error) {
      return sendBrandKitError(error, reply, "brand_kit_query_failed");
    }
  });

  // POST /api/brand-kits — create kit
  app.post("/api/brand-kits", async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) return sendUnauthorized(reply);

      const payload = brandKitCreateRequestSchema.parse(request.body);
      const kit = await options.brandKitService.createKit(user, payload);
      return reply.code(201).send(brandKitDetailResponseSchema.parse(kit));
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({ issues: error.issues, message: "Invalid request body" });
      }
      return sendBrandKitError(error, reply, "brand_kit_create_failed");
    }
  });

  // GET /api/brand-kits/:kitId — get kit detail
  app.get<{ Params: { kitId: string } }>(
    "/api/brand-kits/:kitId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const kit = await options.brandKitService.getKit(user, request.params.kitId);
        return reply.code(200).send(brandKitDetailResponseSchema.parse(kit));
      } catch (error) {
        return sendBrandKitError(error, reply, "brand_kit_not_found");
      }
    },
  );

  // PATCH /api/brand-kits/:kitId — update kit
  app.patch<{ Params: { kitId: string } }>(
    "/api/brand-kits/:kitId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const payload = brandKitUpdateRequestSchema.parse(request.body);
        const kit = await options.brandKitService.updateKit(
          user,
          request.params.kitId,
          payload,
        );
        return reply.code(200).send(brandKitDetailResponseSchema.parse(kit));
      } catch (error) {
        if (isZodError(error)) {
          return reply.code(400).send({ issues: error.issues, message: "Invalid request body" });
        }
        return sendBrandKitError(error, reply, "brand_kit_update_failed");
      }
    },
  );

  // DELETE /api/brand-kits/:kitId — delete kit
  app.delete<{ Params: { kitId: string } }>(
    "/api/brand-kits/:kitId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        await options.brandKitService.deleteKit(user, request.params.kitId);
        return reply.code(204).send();
      } catch (error) {
        return sendBrandKitError(error, reply, "brand_kit_delete_failed");
      }
    },
  );

  // POST /api/brand-kits/:kitId/assets — create asset
  app.post<{ Params: { kitId: string } }>(
    "/api/brand-kits/:kitId/assets",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const payload = brandKitAssetCreateRequestSchema.parse(request.body);
        const asset = await options.brandKitService.createAsset(
          user,
          request.params.kitId,
          payload,
        );
        return reply.code(201).send(brandKitAssetResponseSchema.parse(asset));
      } catch (error) {
        if (isZodError(error)) {
          return reply.code(400).send({ issues: error.issues, message: "Invalid request body" });
        }
        return sendBrandKitError(error, reply, "brand_kit_asset_create_failed");
      }
    },
  );

  // PATCH /api/brand-kits/:kitId/assets/:assetId — update asset
  app.patch<{ Params: { kitId: string; assetId: string } }>(
    "/api/brand-kits/:kitId/assets/:assetId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        const payload = brandKitAssetUpdateRequestSchema.parse(request.body);
        const asset = await options.brandKitService.updateAsset(
          user,
          request.params.kitId,
          request.params.assetId,
          payload,
        );
        return reply.code(200).send(brandKitAssetResponseSchema.parse(asset));
      } catch (error) {
        if (isZodError(error)) {
          return reply.code(400).send({ issues: error.issues, message: "Invalid request body" });
        }
        return sendBrandKitError(error, reply, "brand_kit_asset_not_found");
      }
    },
  );

  // DELETE /api/brand-kits/:kitId/assets/:assetId — delete asset
  app.delete<{ Params: { kitId: string; assetId: string } }>(
    "/api/brand-kits/:kitId/assets/:assetId",
    async (request, reply) => {
      try {
        const user = await options.auth.authenticate(request);
        if (!user) return sendUnauthorized(reply);

        await options.brandKitService.deleteAsset(
          user,
          request.params.kitId,
          request.params.assetId,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendBrandKitError(error, reply, "brand_kit_asset_not_found");
      }
    },
  );
}

function sendUnauthorized(reply: FastifyReply) {
  return reply.code(401).send(
    unauthenticatedErrorResponseSchema.parse({
      error: { code: "unauthorized", message: "Missing or invalid bearer token." },
    }),
  );
}

function sendBrandKitError(
  error: unknown,
  reply: FastifyReply,
  fallbackCode:
    | "brand_kit_not_found"
    | "brand_kit_create_failed"
    | "brand_kit_update_failed"
    | "brand_kit_delete_failed"
    | "brand_kit_query_failed"
    | "brand_kit_asset_not_found"
    | "brand_kit_asset_create_failed",
) {
  if (error instanceof BrandKitServiceError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: error.code, message: error.message },
      }),
    );
  }

  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: { code: fallbackCode, message: "An unexpected error occurred." },
    }),
  );
}

function isZodError(error: unknown): error is { issues: unknown[]; name: string } {
  return (
    error instanceof Error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray(error.issues)
  );
}
```

- [ ] **Step 2: Register routes in app.ts**

In `apps/server/src/app.ts`:

1. Add imports at the top (after existing service imports):
```typescript
import {
  createBrandKitService,
  type BrandKitService,
} from "./features/brand-kit/brand-kit-service.js";
import { registerBrandKitRoutes } from "./http/brand-kits.js";
```

2. Add `brandKitService` to `BuildAppOptions`:
```typescript
brandKitService?: BrandKitService;
```

3. After the `uploadService` initialization (around line 124), add:
```typescript
const brandKitService =
  options.brandKitService ?? createBrandKitService({ createUserClient });
```

4. After `registerUploadRoutes(...)` call (around line 203), add:
```typescript
void registerBrandKitRoutes(app, {
  auth,
  brandKitService,
});
```

- [ ] **Step 3: Verify server compiles**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run build --filter @loomic/shared && pnpm exec tsc --noEmit --project apps/server/tsconfig.json 2>&1 | head -30
```
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/server/src/http/brand-kits.ts apps/server/src/app.ts
git commit -m "$(cat <<'EOF'
feat: add brand kit API routes and register in app
EOF
)"
```

---

## Task 6: Server — Project PATCH Endpoint

**Files:**
- Modify: `apps/server/src/features/projects/project-service.ts`
- Modify: `apps/server/src/http/projects.ts`

- [ ] **Step 1: Add updateProject to ProjectService**

In `apps/server/src/features/projects/project-service.ts`:

1. Add `ProjectUpdateRequest` to the imports from `@loomic/shared`:
```typescript
import type {
  ProjectCreateRequest,
  ProjectSummary,
  ProjectUpdateRequest,
} from "@loomic/shared";
```

2. Add to the `ProjectService` type (after `saveThumbnail`):
```typescript
updateProject(
  user: AuthenticatedUser,
  projectId: string,
  input: ProjectUpdateRequest,
): Promise<void>;
```

3. Add `"project_update_failed"` to `ProjectServiceError.code` union type.

4. Add the implementation in `createProjectService` return object (after `saveThumbnail`):
```typescript
async updateProject(user, projectId, input) {
  const client = options.createUserClient(user.accessToken);

  const updatePayload: Record<string, unknown> = {};
  if (input.brand_kit_id !== undefined) {
    updatePayload.brand_kit_id = input.brand_kit_id;
  }

  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await client
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId);

  if (error) {
    throw new ProjectServiceError(
      "project_update_failed",
      "Unable to update project.",
      500,
    );
  }
},
```

- [ ] **Step 2: Add PATCH route to projects.ts**

In `apps/server/src/http/projects.ts`:

1. Add `projectUpdateRequestSchema` to imports from `@loomic/shared`.

2. Add the PATCH route (after the PUT thumbnail route, before the closing `}` of `registerProjectRoutes`):

```typescript
app.patch<{ Params: { projectId: string } }>(
  "/api/projects/:projectId",
  async (request, reply) => {
    try {
      const user = await options.auth.authenticate(request);
      if (!user) {
        return reply.code(401).send(
          unauthenticatedErrorResponseSchema.parse({
            error: {
              code: "unauthorized",
              message: "Missing or invalid bearer token.",
            },
          }),
        );
      }

      const payload = projectUpdateRequestSchema.parse(request.body);
      await options.projectService.updateProject(
        user,
        request.params.projectId,
        payload,
      );
      return reply.code(204).send();
    } catch (error) {
      if (isZodError(error)) {
        return reply.code(400).send({
          issues: error.issues,
          message: "Invalid request body",
        });
      }
      return sendProjectError(error, reply, "application_error");
    }
  },
);
```

3. Add `"project_update_failed"` to the `sendProjectError` function's `fallbackCode` union type and update the message mapping.

- [ ] **Step 3: Verify compiles**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm exec tsc --noEmit --project apps/server/tsconfig.json 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/server/src/features/projects/project-service.ts apps/server/src/http/projects.ts
git commit -m "$(cat <<'EOF'
feat: add PATCH /api/projects/:projectId for brand_kit_id association
EOF
)"
```

---

## Task 7: Frontend — Brand Kit API Client

**Files:**
- Create: `apps/web/src/lib/brand-kit-api.ts`

- [ ] **Step 1: Create brand-kit-api.ts**

Write file `apps/web/src/lib/brand-kit-api.ts`:

```typescript
import type {
  BrandKitAssetCreateRequest,
  BrandKitAssetResponse,
  BrandKitAssetUpdateRequest,
  BrandKitCreateRequest,
  BrandKitDetailResponse,
  BrandKitListResponse,
  BrandKitUpdateRequest,
} from "@loomic/shared";

import { getServerBaseUrl } from "./env";
import { ApiApplicationError, ApiAuthError } from "./server-api";

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };
}

async function handleErrorResponse(response: Response): Promise<never> {
  if (response.status === 401) throw new ApiAuthError();
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? "application_error";
  const message = body?.error?.message ?? "Request failed";
  throw new ApiApplicationError(code, message);
}

// --- Kit CRUD ---

export async function fetchBrandKits(
  accessToken: string,
): Promise<BrandKitListResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitListResponse;
}

export async function fetchBrandKit(
  accessToken: string,
  kitId: string,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function createBrandKit(
  accessToken: string,
  data?: BrandKitCreateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(`${getServerBaseUrl()}/api/brand-kits`, {
    method: "POST",
    headers: authJsonHeaders(accessToken),
    body: JSON.stringify(data ?? {}),
  });
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function updateBrandKit(
  accessToken: string,
  kitId: string,
  data: BrandKitUpdateRequest,
): Promise<BrandKitDetailResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitDetailResponse;
}

export async function deleteBrandKit(
  accessToken: string,
  kitId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}

// --- Asset CRUD ---

export async function createBrandKitAsset(
  accessToken: string,
  kitId: string,
  data: BrandKitAssetCreateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets`,
    {
      method: "POST",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function updateBrandKitAsset(
  accessToken: string,
  kitId: string,
  assetId: string,
  data: BrandKitAssetUpdateRequest,
): Promise<BrandKitAssetResponse> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "PATCH",
      headers: authJsonHeaders(accessToken),
      body: JSON.stringify(data),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
  return (await response.json()) as BrandKitAssetResponse;
}

export async function deleteBrandKitAsset(
  accessToken: string,
  kitId: string,
  assetId: string,
): Promise<void> {
  const response = await fetch(
    `${getServerBaseUrl()}/api/brand-kits/${kitId}/assets/${assetId}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );
  if (!response.ok) return handleErrorResponse(response);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/lib/brand-kit-api.ts
git commit -m "$(cat <<'EOF'
feat: add typed brand kit API client for frontend
EOF
)"
```

---

## Task 8: Frontend — Shared UI Components (InlineInput, SectionHeader, EmptyState)

**Files:**
- Create: `apps/web/src/components/brand-kit/inline-input.tsx`
- Create: `apps/web/src/components/brand-kit/section-header.tsx`
- Create: `apps/web/src/components/brand-kit/empty-state.tsx`

- [ ] **Step 1: Create inline-input.tsx**

Write file `apps/web/src/components/brand-kit/inline-input.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface InlineInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function InlineInput({
  value,
  onCommit,
  placeholder,
  className,
  inputClassName,
}: InlineInputProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value when not editing
  const displayValue = editing ? draft : value;

  const handleFocus = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        inputRef.current?.blur();
      } else if (e.key === "Escape") {
        setDraft(value);
        setEditing(false);
        inputRef.current?.blur();
      }
    },
    [value],
  );

  return (
    <div className={cn("group", className)}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "w-full bg-transparent border-b border-transparent outline-none transition-colors",
          "group-hover:border-dashed group-hover:border-muted-foreground/40",
          "focus:border-dashed focus:border-muted-foreground/40",
          "placeholder:text-muted-foreground/50",
          inputClassName,
        )}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create section-header.tsx**

Write file `apps/web/src/components/brand-kit/section-header.tsx`:

```tsx
interface SectionHeaderProps {
  title: string;
  count?: number;
}

export function SectionHeader({ title, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create empty-state.tsx**

Write file `apps/web/src/components/brand-kit/empty-state.tsx`:

```tsx
"use client";

import { Palette } from "lucide-react";

interface EmptyStateProps {
  onCreateKit: () => void;
}

export function EmptyState({ onCreateKit }: EmptyStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Palette className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Brand Kit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first brand kit to manage brand assets
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateKit}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          Create Brand Kit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/inline-input.tsx apps/web/src/components/brand-kit/section-header.tsx apps/web/src/components/brand-kit/empty-state.tsx
git commit -m "$(cat <<'EOF'
feat: add brand kit shared UI components (InlineInput, SectionHeader, EmptyState)
EOF
)"
```

---

## Task 9: Frontend — Color Picker Popover

**Files:**
- Create: `apps/web/src/components/brand-kit/color-picker-popover.tsx`

- [ ] **Step 1: Create color-picker-popover.tsx**

Write file `apps/web/src/components/brand-kit/color-picker-popover.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

interface ColorPickerPopoverProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, hex: string) => void;
  initialName?: string;
  initialHex?: string;
  mode: "create" | "edit";
  anchorRef: React.RefObject<HTMLElement | null>;
}

const HEX_REGEX = /^[0-9A-Fa-f]{6}$/;

function normalizeHex(raw: string): string {
  const cleaned = raw.replace(/^#/, "").toUpperCase();
  return HEX_REGEX.test(cleaned) ? cleaned : "";
}

export function ColorPickerPopover({
  open,
  onClose,
  onSave,
  initialName = "",
  initialHex = "000000",
  mode,
  anchorRef,
}: ColorPickerPopoverProps) {
  const [name, setName] = useState(initialName);
  const [hex, setHex] = useState(initialHex.toUpperCase());
  const [hexInput, setHexInput] = useState(initialHex.toUpperCase());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setHex(initialHex.toUpperCase());
      setHexInput(initialHex.toUpperCase());
    }
  }, [open, initialName, initialHex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorRef]);

  const handlePickerChange = useCallback((color: string) => {
    const normalized = color.replace(/^#/, "").toUpperCase();
    setHex(normalized);
    setHexInput(normalized);
  }, []);

  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6);
      setHexInput(raw);
      if (HEX_REGEX.test(raw)) {
        setHex(raw);
      }
    },
    [],
  );

  const handleSave = useCallback(() => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    onSave(name.trim() || "Untitled", normalized);
    onClose();
  }, [hex, name, onSave, onClose]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 w-[260px] rounded-2xl border bg-popover p-3 shadow-lg"
      style={{ top: "100%", left: 0, marginTop: 4 }}
    >
      {/* Name input */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this color"
        className="w-full mb-3 rounded-lg border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
      />

      {/* Color picker */}
      <div className="mb-3 [&_.react-colorful]:!w-full [&_.react-colorful]:!h-[160px]">
        <HexColorPicker
          color={`#${hex}`}
          onChange={handlePickerChange}
        />
      </div>

      {/* Preview + hex input */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-8 w-8 shrink-0 rounded-lg border"
          style={{ backgroundColor: `#${hex}` }}
        />
        <div className="flex items-center rounded-lg border bg-background px-2 py-1 text-sm flex-1">
          <span className="text-muted-foreground mr-1">#</span>
          <input
            type="text"
            value={hexInput}
            onChange={handleHexInputChange}
            className="w-full bg-transparent outline-none font-mono text-sm"
            maxLength={6}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          {mode === "create" ? "Add" : "Save"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/color-picker-popover.tsx
git commit -m "$(cat <<'EOF'
feat: add color picker popover with react-colorful
EOF
)"
```

---

## Task 10: Frontend — Content Sections (Guidance, Color, Font, Logo, Image, AssetCard)

**Files:**
- Create: `apps/web/src/components/brand-kit/guidance-section.tsx`
- Create: `apps/web/src/components/brand-kit/color-section.tsx`
- Create: `apps/web/src/components/brand-kit/font-section.tsx`
- Create: `apps/web/src/components/brand-kit/asset-card.tsx`
- Create: `apps/web/src/components/brand-kit/logo-section.tsx`
- Create: `apps/web/src/components/brand-kit/image-section.tsx`

- [ ] **Step 1: Create guidance-section.tsx**

Write file `apps/web/src/components/brand-kit/guidance-section.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionHeader } from "./section-header";

interface GuidanceSectionProps {
  value: string | null;
  onSave: (text: string | null) => void;
}

export function GuidanceSection({ value, onSave }: GuidanceSectionProps) {
  const [draft, setDraft] = useState(value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(value);

  // Sync external value when it changes from outside
  useEffect(() => {
    if (value !== savedRef.current) {
      setDraft(value ?? "");
      savedRef.current = value;
    }
  }, [value]);

  const flush = useCallback(
    (text: string) => {
      const normalized = text.trim() || null;
      if (normalized !== savedRef.current) {
        savedRef.current = normalized;
        onSave(normalized);
      }
    },
    [onSave],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setDraft(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(text), 1000);
    },
    [flush],
  );

  const handleBlur = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    flush(draft);
  }, [draft, flush]);

  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft]);

  return (
    <div className="my-12">
      <SectionHeader title="Design Guidance" />
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Describe your brand's design guidelines, tone, and visual principles..."
        rows={3}
        className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm outline-none transition-colors focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create color-section.tsx**

Write file `apps/web/src/components/brand-kit/color-section.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { BrandKitAsset } from "@loomic/shared";

import { ColorPickerPopover } from "./color-picker-popover";
import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface ColorSectionProps {
  colors: BrandKitAsset[];
  onAddColor: (name: string, hex: string) => void;
  onUpdateColor: (assetId: string, name: string, hex: string) => void;
  onDeleteColor: (assetId: string) => void;
  onUpdateLabel: (assetId: string, name: string) => void;
}

export function ColorSection({
  colors,
  onAddColor,
  onUpdateColor,
  onDeleteColor,
  onUpdateLabel,
}: ColorSectionProps) {
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    assetId?: string;
    name?: string;
    hex?: string;
  }>({ open: false, mode: "create" });

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const editAnchorRef = useRef<HTMLDivElement>(null);

  const handleAddClick = useCallback(() => {
    setPickerState({
      open: true,
      mode: "create",
      name: "",
      hex: "000000",
    });
  }, []);

  const handleSwatchClick = useCallback(
    (asset: BrandKitAsset) => {
      setPickerState({
        open: true,
        mode: "edit",
        assetId: asset.id,
        name: asset.display_name,
        hex: asset.text_content ?? "000000",
      });
    },
    [],
  );

  const handlePickerSave = useCallback(
    (name: string, hex: string) => {
      if (pickerState.mode === "create") {
        onAddColor(name, hex);
      } else if (pickerState.assetId) {
        onUpdateColor(pickerState.assetId, name, hex);
      }
    },
    [pickerState, onAddColor, onUpdateColor],
  );

  const handlePickerClose = useCallback(() => {
    setPickerState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <div className="mb-8">
      <SectionHeader title="Colors" count={colors.length} />
      <div className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <div key={color.id} className="group w-[69px]">
            <div className="relative">
              <button
                type="button"
                onClick={() => handleSwatchClick(color)}
                className="h-[69px] w-[69px] rounded-xl border transition-shadow hover:shadow-md cursor-pointer"
                style={{ backgroundColor: `#${color.text_content ?? "000000"}` }}
              />
              <button
                type="button"
                onClick={() => onDeleteColor(color.id)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <InlineInput
              value={color.display_name}
              onCommit={(name) => onUpdateLabel(color.id, name)}
              placeholder="Label"
              className="mt-1"
              inputClassName="text-xs text-center"
            />
          </div>
        ))}

        {/* Add color button */}
        <div className="relative w-[69px]" ref={editAnchorRef}>
          <button
            ref={addBtnRef}
            type="button"
            onClick={handleAddClick}
            className="flex h-[69px] w-[69px] items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors cursor-pointer"
          >
            <Plus className="h-5 w-5 text-muted-foreground" />
          </button>
          <ColorPickerPopover
            open={pickerState.open}
            onClose={handlePickerClose}
            onSave={handlePickerSave}
            initialName={pickerState.name}
            initialHex={pickerState.hex}
            mode={pickerState.mode}
            anchorRef={pickerState.mode === "create" ? addBtnRef : editAnchorRef}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create font-section.tsx**

Write file `apps/web/src/components/brand-kit/font-section.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2, Type } from "lucide-react";
import type { BrandKitAsset } from "@loomic/shared";

import { InlineInput } from "./inline-input";
import { SectionHeader } from "./section-header";

interface FontSectionProps {
  fonts: BrandKitAsset[];
  onAddFont: (name: string) => void;
  onUpdateFont: (assetId: string, name: string) => void;
  onDeleteFont: (assetId: string) => void;
}

export function FontSection({
  fonts,
  onAddFont,
  onUpdateFont,
  onDeleteFont,
}: FontSectionProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddFont(trimmed);
      setNewName("");
      setAdding(false);
    }
  }, [newName, onAddFont]);

  return (
    <div className="mb-8">
      <SectionHeader title="Fonts" count={fonts.length} />
      <div className="flex flex-wrap gap-3">
        {fonts.map((font) => (
          <div key={font.id} className="group w-[150px]">
            <div className="relative flex h-[113px] items-center justify-center rounded-xl border bg-muted/30">
              <span className="text-[44px] font-light text-foreground/70 select-none">
                Ag
              </span>
              <button
                type="button"
                onClick={() => onDeleteFont(font.id)}
                className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
            <InlineInput
              value={font.display_name}
              onCommit={(name) => onUpdateFont(font.id, name)}
              placeholder="Font name"
              className="mt-1.5"
              inputClassName="text-xs"
            />
          </div>
        ))}

        {/* Add font card */}
        {adding ? (
          <div className="w-[150px]">
            <div className="flex h-[113px] items-center justify-center rounded-xl border border-dashed">
              <Type className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
              placeholder="Font name"
              autoFocus
              className="mt-1.5 w-full bg-transparent border-b border-dashed border-muted-foreground/40 text-xs outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[113px] w-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors cursor-pointer"
          >
            <Plus className="h-5 w-5 text-muted-foreground" />
            <span className="mt-1 text-xs text-muted-foreground">Add Font</span>
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create asset-card.tsx**

Write file `apps/web/src/components/brand-kit/asset-card.tsx`:

```tsx
"use client";

import { ImageIcon, Plus, Trash2 } from "lucide-react";
import type { BrandKitAsset } from "@loomic/shared";
import { InlineInput } from "./inline-input";

interface AssetCardProps {
  asset: BrandKitAsset;
  onUpdateLabel: (name: string) => void;
  onDelete: () => void;
}

export function AssetCard({ asset, onUpdateLabel, onDelete }: AssetCardProps) {
  return (
    <div className="group w-[150px]">
      <div className="relative flex h-[113px] items-center justify-center rounded-xl border bg-muted/30 overflow-hidden">
        {asset.file_url ? (
          <img
            src={asset.file_url}
            alt={asset.display_name}
            className="h-full w-full object-contain p-[10%]"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        )}
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-background border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      <InlineInput
        value={asset.display_name}
        onCommit={onUpdateLabel}
        placeholder="Label"
        className="mt-1.5"
        inputClassName="text-xs"
      />
    </div>
  );
}

interface AddAssetCardProps {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function AddAssetCard({ label, disabled, onClick }: AddAssetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[113px] w-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-muted-foreground/30"
    >
      <Plus className="h-5 w-5 text-muted-foreground" />
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </button>
  );
}
```

- [ ] **Step 5: Create logo-section.tsx**

Write file `apps/web/src/components/brand-kit/logo-section.tsx`:

```tsx
"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { AssetCard, AddAssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface LogoSectionProps {
  logos: BrandKitAsset[];
  onUpdateLabel: (assetId: string, name: string) => void;
  onDeleteLogo: (assetId: string) => void;
}

export function LogoSection({ logos, onUpdateLabel, onDeleteLogo }: LogoSectionProps) {
  return (
    <div className="mb-8">
      <SectionHeader title="Logo" count={logos.length} />
      <div className="flex flex-wrap gap-3">
        {logos.map((logo) => (
          <AssetCard
            key={logo.id}
            asset={logo}
            onUpdateLabel={(name) => onUpdateLabel(logo.id, name)}
            onDelete={() => onDeleteLogo(logo.id)}
          />
        ))}
        <AddAssetCard label="Upload Logo" disabled />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create image-section.tsx**

Write file `apps/web/src/components/brand-kit/image-section.tsx`:

```tsx
"use client";

import type { BrandKitAsset } from "@loomic/shared";
import { AssetCard, AddAssetCard } from "./asset-card";
import { SectionHeader } from "./section-header";

interface ImageSectionProps {
  images: BrandKitAsset[];
  onUpdateLabel: (assetId: string, name: string) => void;
  onDeleteImage: (assetId: string) => void;
}

export function ImageSection({ images, onUpdateLabel, onDeleteImage }: ImageSectionProps) {
  return (
    <div className="pb-8">
      <SectionHeader title="Images" count={images.length} />
      <div className="flex flex-wrap gap-3">
        {images.map((image) => (
          <AssetCard
            key={image.id}
            asset={image}
            onUpdateLabel={(name) => onUpdateLabel(image.id, name)}
            onDelete={() => onDeleteImage(image.id)}
          />
        ))}
        <AddAssetCard label="Upload Image" disabled />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/guidance-section.tsx apps/web/src/components/brand-kit/color-section.tsx apps/web/src/components/brand-kit/font-section.tsx apps/web/src/components/brand-kit/asset-card.tsx apps/web/src/components/brand-kit/logo-section.tsx apps/web/src/components/brand-kit/image-section.tsx
git commit -m "$(cat <<'EOF'
feat: add brand kit content sections (guidance, color, font, logo, image)
EOF
)"
```

---

## Task 11: Frontend — Brand Kit Editor

**Files:**
- Create: `apps/web/src/components/brand-kit/brand-kit-editor.tsx`

- [ ] **Step 1: Create brand-kit-editor.tsx**

Write file `apps/web/src/components/brand-kit/brand-kit-editor.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { MoreHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { BrandKitAsset, BrandKitDetail } from "@loomic/shared";

import { InlineInput } from "./inline-input";
import { GuidanceSection } from "./guidance-section";
import { ColorSection } from "./color-section";
import { FontSection } from "./font-section";
import { LogoSection } from "./logo-section";
import { ImageSection } from "./image-section";

interface BrandKitEditorProps {
  kit: BrandKitDetail;
  onUpdateKit: (updates: {
    name?: string;
    guidance_text?: string | null;
    is_default?: boolean;
  }) => void;
  onDeleteKit: () => void;
  onAddAsset: (type: BrandKitAsset["asset_type"], name: string, textContent?: string) => void;
  onUpdateAsset: (assetId: string, updates: { display_name?: string; text_content?: string }) => void;
  onDeleteAsset: (assetId: string) => void;
}

export function BrandKitEditor({
  kit,
  onUpdateKit,
  onDeleteKit,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
}: BrandKitEditorProps) {
  const colors = kit.assets.filter((a) => a.asset_type === "color");
  const fonts = kit.assets.filter((a) => a.asset_type === "font");
  const logos = kit.assets.filter((a) => a.asset_type === "logo");
  const images = kit.assets.filter((a) => a.asset_type === "image");

  // Handlers
  const handleNameCommit = useCallback(
    (name: string) => onUpdateKit({ name }),
    [onUpdateKit],
  );

  const handleGuidanceSave = useCallback(
    (text: string | null) => onUpdateKit({ guidance_text: text }),
    [onUpdateKit],
  );

  const handleDefaultToggle = useCallback(() => {
    onUpdateKit({ is_default: !kit.is_default });
  }, [kit.is_default, onUpdateKit]);

  const handleAddColor = useCallback(
    (name: string, hex: string) => onAddAsset("color", name, hex),
    [onAddAsset],
  );

  const handleUpdateColor = useCallback(
    (assetId: string, name: string, hex: string) => {
      onUpdateAsset(assetId, { display_name: name, text_content: hex });
    },
    [onUpdateAsset],
  );

  const handleAddFont = useCallback(
    (name: string) => onAddAsset("font", name, name),
    [onAddAsset],
  );

  const handleUpdateFont = useCallback(
    (assetId: string, name: string) => {
      onUpdateAsset(assetId, { display_name: name, text_content: name });
    },
    [onUpdateAsset],
  );

  return (
    <div className="flex flex-1 flex-col min-w-0">
      {/* Editor Header */}
      <div className="flex h-[96px] items-center justify-between border-b px-6 @[1024px]:px-[80px] @[1440px]:px-[160px]">
        <InlineInput
          value={kit.name}
          onCommit={handleNameCommit}
          placeholder="Kit name"
          inputClassName="text-2xl font-semibold"
        />

        <div className="flex items-center gap-3 shrink-0 ml-4">
          {/* Default switch */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Apply to new projects
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={kit.is_default}
              onClick={handleDefaultToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                kit.is_default ? "bg-foreground" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                  kit.is_default ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </label>

          {/* Divider */}
          <div className="h-5 w-px bg-border" />

          {/* Delete */}
          <button
            type="button"
            onClick={onDeleteKit}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors cursor-pointer"
            title="Delete kit"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto px-6 @[1024px]:px-[80px] @[1440px]:px-[160px]">
        {/* Extract button (Phase 2 — disabled) */}
        <div className="mt-6">
          <button
            type="button"
            disabled
            className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
          >
            <Sparkles className="h-4 w-4" />
            Extract from file
          </button>
        </div>

        <GuidanceSection
          value={kit.guidance_text}
          onSave={handleGuidanceSave}
        />

        <LogoSection
          logos={logos}
          onUpdateLabel={(id, name) => onUpdateAsset(id, { display_name: name })}
          onDeleteLogo={onDeleteAsset}
        />

        <ColorSection
          colors={colors}
          onAddColor={handleAddColor}
          onUpdateColor={handleUpdateColor}
          onDeleteColor={onDeleteAsset}
          onUpdateLabel={(id, name) => onUpdateAsset(id, { display_name: name })}
        />

        <FontSection
          fonts={fonts}
          onAddFont={handleAddFont}
          onUpdateFont={handleUpdateFont}
          onDeleteFont={onDeleteAsset}
        />

        <ImageSection
          images={images}
          onUpdateLabel={(id, name) => onUpdateAsset(id, { display_name: name })}
          onDeleteImage={onDeleteAsset}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/brand-kit-editor.tsx
git commit -m "$(cat <<'EOF'
feat: add brand kit editor with header, sections, and actions
EOF
)"
```

---

## Task 12: Frontend — Brand Kit Sidebar

**Files:**
- Create: `apps/web/src/components/brand-kit/brand-kit-sidebar.tsx`

- [ ] **Step 1: Create brand-kit-sidebar.tsx**

Write file `apps/web/src/components/brand-kit/brand-kit-sidebar.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { BrandKitSummary } from "@loomic/shared";
import { cn } from "@/lib/utils";

interface BrandKitSidebarProps {
  kits: BrandKitSummary[];
  selectedKitId: string | null;
  onSelectKit: (kitId: string) => void;
  onCreateKit: () => void;
  onDeleteKit: (kitId: string) => void;
}

export function BrandKitSidebar({
  kits,
  selectedKitId,
  onSelectKit,
  onCreateKit,
  onDeleteKit,
}: BrandKitSidebarProps) {
  const router = useRouter();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r bg-neutral-50">
      {/* Header */}
      <div className="flex h-15 items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="font-medium">Brand Kit</span>
        </button>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Beta
        </span>
      </div>

      {/* Create button */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onCreateKit}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/30 py-2 text-sm text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Kit
        </button>
      </div>

      {/* Kit list */}
      <div className="flex-1 overflow-y-auto px-2">
        {kits.map((kit) => (
          <div
            key={kit.id}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer transition-colors",
              kit.id === selectedKitId
                ? "bg-neutral-100"
                : "hover:bg-neutral-100/60",
            )}
            onClick={() => onSelectKit(kit.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onSelectKit(kit.id); }}
            role="button"
            tabIndex={0}
          >
            {/* Thumbnail placeholder */}
            <div className="flex h-10 w-[72px] shrink-0 items-center justify-center rounded-md bg-muted/50 border overflow-hidden aspect-[160/90]">
              {kit.cover_url ? (
                <img
                  src={kit.cover_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-muted-foreground/40 select-none">
                  {kit.asset_counts.color + kit.asset_counts.font > 0
                    ? `${kit.asset_counts.color}c ${kit.asset_counts.font}f`
                    : "Empty"}
                </span>
              )}
            </div>

            {/* Name + default badge */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{kit.name}</div>
              {kit.is_default && (
                <span className="text-[10px] text-muted-foreground">Default</span>
              )}
            </div>

            {/* Delete button on hover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteKit(kit.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md hover:bg-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/brand-kit-sidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add brand kit sidebar with kit list and create button
EOF
)"
```

---

## Task 13: Frontend — Brand Kit Page (Orchestrator + Route)

**Files:**
- Create: `apps/web/src/components/brand-kit/brand-kit-page.tsx`
- Create: `apps/web/src/app/brand-kit/page.tsx`

- [ ] **Step 1: Create brand-kit-page.tsx (orchestrator)**

Write file `apps/web/src/components/brand-kit/brand-kit-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BrandKitDetail, BrandKitSummary, BrandKitAsset } from "@loomic/shared";

import { useAuth } from "@/lib/auth-context";
import {
  fetchBrandKits,
  fetchBrandKit,
  createBrandKit,
  updateBrandKit,
  deleteBrandKit,
  createBrandKitAsset,
  updateBrandKitAsset,
  deleteBrandKitAsset,
} from "@/lib/brand-kit-api";

import { BrandKitSidebar } from "./brand-kit-sidebar";
import { BrandKitEditor } from "./brand-kit-editor";
import { EmptyState } from "./empty-state";

export function BrandKitPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [kits, setKits] = useState<BrandKitSummary[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKitDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const accessToken = session?.access_token;
  const selectedIdFromUrl = searchParams.get("id");

  // Load kit list
  const loadKits = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetchBrandKits(accessToken);
      setKits(response.brandKits);
      return response.brandKits;
    } catch (err) {
      console.error("Failed to load brand kits:", err);
      return [];
    }
  }, [accessToken]);

  // Load kit detail
  const loadKit = useCallback(
    async (kitId: string) => {
      if (!accessToken) return;
      try {
        const kit = await fetchBrandKit(accessToken, kitId);
        setSelectedKit(kit);
      } catch (err) {
        console.error("Failed to load brand kit:", err);
        setSelectedKit(null);
      }
    },
    [accessToken],
  );

  // Initial load
  useEffect(() => {
    if (authLoading || !accessToken) return;

    (async () => {
      setLoading(true);
      const loadedKits = await loadKits();
      if (loadedKits && loadedKits.length > 0) {
        const targetId = selectedIdFromUrl ?? loadedKits[0].id;
        await loadKit(targetId);
      }
      setLoading(false);
    })();
    // Intentionally excluding loadKits/loadKit/selectedIdFromUrl — we only want
    // to run this effect on auth state change, not when callbacks are recreated.
  }, [authLoading, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Select kit
  const handleSelectKit = useCallback(
    async (kitId: string) => {
      router.replace(`/brand-kit?id=${kitId}`, { scroll: false });
      await loadKit(kitId);
    },
    [router, loadKit],
  );

  // Create kit
  const handleCreateKit = useCallback(async () => {
    if (!accessToken) return;
    try {
      const newKit = await createBrandKit(accessToken);
      await loadKits();
      router.replace(`/brand-kit?id=${newKit.id}`, { scroll: false });
      setSelectedKit(newKit);
    } catch (err) {
      console.error("Failed to create brand kit:", err);
    }
  }, [accessToken, loadKits, router]);

  // Update kit
  const handleUpdateKit = useCallback(
    async (updates: { name?: string; guidance_text?: string | null; is_default?: boolean }) => {
      if (!accessToken || !selectedKit) return;
      try {
        const updated = await updateBrandKit(accessToken, selectedKit.id, updates);
        setSelectedKit(updated);
        await loadKits();
      } catch (err) {
        console.error("Failed to update brand kit:", err);
      }
    },
    [accessToken, selectedKit, loadKits],
  );

  // Delete kit
  const handleDeleteKit = useCallback(
    async (kitId?: string) => {
      if (!accessToken) return;
      const targetId = kitId ?? selectedKit?.id;
      if (!targetId) return;

      try {
        await deleteBrandKit(accessToken, targetId);
        const updatedKits = await loadKits();
        if (updatedKits && updatedKits.length > 0) {
          const nextKit = updatedKits.find((k) => k.id !== targetId) ?? updatedKits[0];
          router.replace(`/brand-kit?id=${nextKit.id}`, { scroll: false });
          await loadKit(nextKit.id);
        } else {
          setSelectedKit(null);
          router.replace("/brand-kit", { scroll: false });
        }
      } catch (err) {
        console.error("Failed to delete brand kit:", err);
      }
    },
    [accessToken, selectedKit, loadKits, loadKit, router],
  );

  // Add asset
  const handleAddAsset = useCallback(
    async (type: BrandKitAsset["asset_type"], name: string, textContent?: string) => {
      if (!accessToken || !selectedKit) return;
      try {
        await createBrandKitAsset(accessToken, selectedKit.id, {
          asset_type: type,
          display_name: name,
          text_content: textContent ?? null,
        });
        await loadKit(selectedKit.id);
      } catch (err) {
        console.error("Failed to add asset:", err);
      }
    },
    [accessToken, selectedKit, loadKit],
  );

  // Update asset
  const handleUpdateAsset = useCallback(
    async (assetId: string, updates: { display_name?: string; text_content?: string }) => {
      if (!accessToken || !selectedKit) return;
      try {
        await updateBrandKitAsset(accessToken, selectedKit.id, assetId, updates);
        await loadKit(selectedKit.id);
      } catch (err) {
        console.error("Failed to update asset:", err);
      }
    },
    [accessToken, selectedKit, loadKit],
  );

  // Delete asset
  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      if (!accessToken || !selectedKit) return;
      try {
        await deleteBrandKitAsset(accessToken, selectedKit.id, assetId);
        await loadKit(selectedKit.id);
      } catch (err) {
        console.error("Failed to delete asset:", err);
      }
    },
    [accessToken, selectedKit, loadKit],
  );

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace("/login");
    }
  }, [authLoading, session, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background">
      <BrandKitSidebar
        kits={kits}
        selectedKitId={selectedKit?.id ?? null}
        onSelectKit={handleSelectKit}
        onCreateKit={handleCreateKit}
        onDeleteKit={handleDeleteKit}
      />
      {selectedKit ? (
        <BrandKitEditor
          kit={selectedKit}
          onUpdateKit={handleUpdateKit}
          onDeleteKit={() => handleDeleteKit()}
          onAddAsset={handleAddAsset}
          onUpdateAsset={handleUpdateAsset}
          onDeleteAsset={handleDeleteAsset}
        />
      ) : (
        <EmptyState onCreateKit={handleCreateKit} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the page route**

Write file `apps/web/src/app/brand-kit/page.tsx`:

```tsx
import { Suspense } from "react";
import { BrandKitPage } from "@/components/brand-kit/brand-kit-page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <BrandKitPage />
    </Suspense>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/brand-kit/brand-kit-page.tsx apps/web/src/app/brand-kit/page.tsx
git commit -m "$(cat <<'EOF'
feat: add brand kit page with state management and routing
EOF
)"
```

---

## Task 14: Frontend — Navigation Entry in Project Sidebar

**Files:**
- Modify: `apps/web/src/components/project-sidebar.tsx`

- [ ] **Step 1: Add Brand Kit navigation link**

In `apps/web/src/components/project-sidebar.tsx`:

Add a Brand Kit navigation button below the "Projects" button and above the "Settings" button:

```tsx
<button
  type="button"
  onClick={() => router.push("/brand-kit")}
  className="block w-full text-left text-sm text-muted-foreground px-2 py-1.5 rounded hover:bg-neutral-100 cursor-pointer"
>
  Brand Kit
</button>
```

Insert this between the "Projects" `<div>` (line ~46) and the Settings `<button>` (line ~48).

- [ ] **Step 2: Commit**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add apps/web/src/components/project-sidebar.tsx
git commit -m "$(cat <<'EOF'
feat: add Brand Kit navigation link in project sidebar
EOF
)"
```

---

## Task 15: Type Generation & Full Build Verification

**Files:** No new files.

- [ ] **Step 1: Generate or update Supabase types**

The migration added three database objects that must be reflected in `packages/shared/src/supabase/database.ts`:
1. **`brand_kit_asset_type` enum** — add to the `Enums` section
2. **`brand_kits` table** — add to the `Tables` section (all columns from migration)
3. **`brand_kit_assets` table** — add to the `Tables` section (all columns from migration)
4. **`projects.brand_kit_id`** — add this nullable UUID column to the existing `projects` table type

Try auto-generation first:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && npx supabase gen types typescript --local > packages/shared/src/supabase/database.ts
```

If that command fails (e.g., no local Supabase instance), or if the project uses a remote Supabase instance:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > packages/shared/src/supabase/database.ts
```

If both fail, manually add the types to `database.ts`. The server code uses `client.from("brand_kits")` and `client.from("brand_kit_assets")` which require these type definitions to compile.

- [ ] **Step 2: Full build**

Run:
```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run build 2>&1 | tail -40
```
Expected: All packages build successfully. Fix any TypeScript or build errors.

- [ ] **Step 3: Commit type updates if needed**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic
git add -A && git diff --cached --stat
# If there are type file changes, commit them
git commit -m "$(cat <<'EOF'
chore: update Supabase types for brand kit tables
EOF
)"
```

---

## Task 16: E2E Verification

- [ ] **Step 1: Start dev servers**

```bash
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run dev --filter @loomic/server &
cd /Users/nowcoder/Desktop/auto-code-work/Loomic && pnpm run dev --filter @loomic/web &
```

Wait for both servers to start (server on :3001, web on :3000).

- [ ] **Step 2: Test API endpoints with curl**

```bash
# Get auth token from browser/Supabase, then:
# List kits (should return empty initially)
curl -s http://localhost:3001/api/brand-kits -H "Authorization: Bearer $TOKEN" | jq .

# Create a kit
curl -s -X POST http://localhost:3001/api/brand-kits -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' | jq .

# Add a color asset to the kit
curl -s -X POST http://localhost:3001/api/brand-kits/$KIT_ID/assets -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"asset_type":"color","display_name":"Primary","text_content":"FF5733"}' | jq .
```

- [ ] **Step 3: Open browser and verify Brand Kit page**

Navigate to `http://localhost:3000/brand-kit` in the browser. Verify:
- Page loads with sidebar and editor area
- Can create a new kit
- Can edit kit name (inline input)
- Can add/edit/delete colors with color picker
- Can add/edit/delete font names
- Guidance textarea works with debounced save
- Default switch toggles
- Kit switching works in sidebar
- Empty state shows when no kits exist
- Navigation from project sidebar works

- [ ] **Step 4: Fix any issues found during verification**

If issues are found, fix them and commit the fixes.
