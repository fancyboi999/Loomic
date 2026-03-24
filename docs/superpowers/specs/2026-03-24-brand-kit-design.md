# Brand Kit Feature — Design Spec

## Overview

Brand Kit 是一个用户级的品牌资产管理功能，用户可以创建和管理多个 Brand Kit（包含设计指南、颜色、字体、Logo、参考图像），并将其关联到 Project，使 AI Agent 在设计生成时遵循品牌规范。

UI 以 Lovart Brand Kit 页面为参考进行像素级视觉还原，使用 Loomic 自有技术栈（Tailwind 4 + shadcn + Base UI）实现。

## Scope

### Phase 1（本次实现）

- 完整 Brand Kit 页面 UI（`/brand-kit` 路由）
- 左侧栏：Kit 列表、新建、选中切换
- 右侧编辑区：Kit 名称编辑、"套用至新专案"开关、更多菜单
- 设计指南 section：auto-resize textarea
- 颜色 section：色块展示、react-colorful 颜色选择器 Popover、增删改
- 字体 section：字体名称/标签卡片展示（文本编辑部分）
- Brand Kit CRUD API + 数据库 schema
- Kit 与 Project 关联
- 主侧栏增加 Brand Kit 入口

### Phase 2（OSS 就绪后）

- Logo 上传/管理
- 字体文件上传 + @font-face 动态注册
- 参考图像上传/管理
- "从文件中提取"异步任务（独立 HTTP endpoint，非 Agent）

## Architecture Decisions

| 决策 | 结论 | 理由 |
|------|------|------|
| Kit 层级 | 用户级 | Kit 独立于 Project，可被多个 Project 复用 |
| 数据存储 | 混合方案：`brand_kits` + `brand_kit_assets` 两表 | 简洁且灵活，统一 asset_type 区分资产类型，易扩展 |
| UI 技术栈 | Tailwind 4 + shadcn + Base UI | 保持现有技术栈统一，不引入 Mantine |
| 颜色选择器 | react-colorful (~2KB) | 同 Lovart，轻量零依赖 |
| 路由 | `/brand-kit` 顶级路由 | 独立编辑器式页面，不嵌套 |
| 设计指南存储 | `brand_kits.guidance_text` 字段 | 每 Kit 唯一，不需要当 asset 管理 |
| "从文件中提取" | 独立 HTTP endpoint + 异步任务轮询 | 一次性操作，不走 Agent runtime |
| Shared contracts | 独立文件 `brand-kit-contracts.ts`，从 `index.ts` re-export | 功能模块足够大，独立文件更清晰；同时包含 entity schema 和 HTTP request/response schema |

## Database Schema

```sql
-- 资产类型枚举
CREATE TYPE public.brand_kit_asset_type AS ENUM ('color', 'font', 'logo', 'image');

-- brand_kits: Kit 主表
CREATE TABLE public.brand_kits (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '未命名',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  guidance_text TEXT,
  cover_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- brand_kit_assets: 统一资产表
CREATE TABLE public.brand_kit_assets (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kit_id        UUID NOT NULL REFERENCES public.brand_kits(id) ON DELETE CASCADE,
  asset_type    public.brand_kit_asset_type NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT,
  sort_order    INT NOT NULL DEFAULT 0,
  text_content  TEXT,                          -- color: '#F0F0F0', font: family name
  file_url      TEXT,                          -- file URL (Phase 2)
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- projects 表增加关联
ALTER TABLE public.projects ADD COLUMN brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL;

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_kits_updated_at
  BEFORE UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER brand_kit_assets_updated_at
  BEFORE UPDATE ON public.brand_kit_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 索引
CREATE INDEX idx_brand_kits_user ON public.brand_kits(user_id);
CREATE INDEX idx_brand_kit_assets_kit ON public.brand_kit_assets(kit_id);
CREATE INDEX idx_brand_kit_assets_type ON public.brand_kit_assets(kit_id, asset_type);

-- RLS
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_kit_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_kits_user_policy ON public.brand_kits
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY brand_kit_assets_policy ON public.brand_kit_assets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.brand_kits WHERE id = kit_id AND user_id = auth.uid())
  );

-- 每个用户最多一个 default Kit
CREATE UNIQUE INDEX idx_brand_kits_default
  ON public.brand_kits(user_id) WHERE is_default = true;
```

### is_default 切换逻辑

设置 Kit 为 default 时，必须原子性地取消旧 default：

```sql
-- 在一个事务中执行：
UPDATE public.brand_kits SET is_default = false WHERE user_id = $1 AND is_default = true;
UPDATE public.brand_kits SET is_default = true WHERE id = $2 AND user_id = $1;
```

服务端在 `BrandKitService.setDefault()` 中使用 Supabase transaction (rpc) 或顺序执行两条 update（RLS 允许用户更新自己的行）。

### Asset Type 存储约定

| asset_type | display_name | text_content | file_url | metadata |
|------------|-------------|-------------|---------|----------|
| `color` | "Cloud" | "#F0F0F0" (6位 hex，大写归一化) | null | `{}` |
| `font` | "Feature Display" | font family name | .ttf URL (Phase2) | `{weight, style}` |
| `logo` | "Primary Logo" | null | .png URL (Phase2) | `{width, height}` |
| `image` | "AI Art Style" | null | .png URL (Phase2) | `{width, height}` |

**颜色 hex 值规范：** 前端统一归一化为 6 位大写 hex（不接受 3 位简写或 alpha 通道），存储时不含 `#` 前缀（存 `F0F0F0`），展示时前端加 `#`。

## Shared Contracts (Zod Schemas)

文件：`packages/shared/src/brand-kit-contracts.ts`，从 `packages/shared/src/index.ts` re-export。

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

export const brandKitDetailResponseSchema = brandKitDetailSchema;

export const brandKitAssetResponseSchema = brandKitAssetSchema;
```

### Error Codes

在 `packages/shared/src/http.ts` 的 `applicationErrorCodeSchema` 中新增：

```typescript
"brand_kit_not_found"
"brand_kit_create_failed"
"brand_kit_update_failed"
"brand_kit_asset_not_found"
"brand_kit_asset_create_failed"
```

## API Design

Base path: `/api/brand-kits`. Auth: Bearer token (existing pattern).

### Kit CRUD

```
GET    /api/brand-kits                        → 用户所有 Kit 列表
POST   /api/brand-kits                        → 创建 Kit { name? }
GET    /api/brand-kits/:kitId                 → Kit 详情 + 所有 assets
PATCH  /api/brand-kits/:kitId                 → 更新 Kit { name?, guidance_text?, is_default? }
DELETE /api/brand-kits/:kitId                 → 删除 Kit (级联删除 assets)
```

### Asset CRUD

```
POST   /api/brand-kits/:kitId/assets          → 添加资产
PATCH  /api/brand-kits/:kitId/assets/:assetId → 更新资产
DELETE /api/brand-kits/:kitId/assets/:assetId → 删除资产
```

### Project 关联

新增 `PATCH /api/projects/:projectId` endpoint（目前不存在该方法，需新建）：

```
PATCH  /api/projects/:projectId               → { brand_kit_id } (新 endpoint)
```

同时扩展 `projectCreateRequestSchema` 增加可选 `brand_kit_id` 字段，创建项目时可直接关联。

### 响应格式

**GET /api/brand-kits:**
```json
{
  "brandKits": [
    {
      "id": "uuid",
      "name": "My Brand",
      "is_default": true,
      "cover_url": null,
      "asset_counts": { "color": 4, "font": 2, "logo": 0, "image": 0 },
      "created_at": "2026-03-24T12:00:00Z",
      "updated_at": "2026-03-24T12:30:00Z"
    }
  ]
}
```

**GET /api/brand-kits/:kitId:**
```json
{
  "id": "uuid",
  "name": "My Brand",
  "is_default": true,
  "guidance_text": "...",
  "cover_url": null,
  "assets": [
    {
      "id": "uuid",
      "asset_type": "color",
      "display_name": "Cloud",
      "role": "primary",
      "text_content": "F0F0F0",
      "file_url": null,
      "sort_order": 0,
      "metadata": {},
      "created_at": "2026-03-24T12:00:00Z",
      "updated_at": "2026-03-24T12:00:00Z"
    }
  ],
  "created_at": "2026-03-24T12:00:00Z",
  "updated_at": "2026-03-24T12:30:00Z"
}
```

## Frontend Architecture

### Route & Navigation

```
/brand-kit → Brand Kit 编辑器 (全屏独立布局)
```

**入口点：** 在现有 `project-sidebar.tsx` 中增加 Brand Kit 导航链接（位于 Projects 下方），使用画笔/调色板图标。点击导航到 `/brand-kit`。

### Component Tree

```
app/brand-kit/page.tsx
└── BrandKitPage
    ├── BrandKitSidebar (w-[260px], border-r)
    │   ├── SidebarHeader (返回 + 标题 + Beta badge)
    │   ├── CreateKitButton
    │   └── KitList
    │       └── KitListItem[] (缩略图 + 名称 + hover 更多菜单)
    │
    └── BrandKitEditor (flex-1)
        ├── EditorHeader (h-[96px])
        │   ├── KitNameInput (inline editable, 24px semibold)
        │   └── EditorActions (DefaultSwitch + MoreMenu)
        │
        └── EditorContent (scrollable)
            ├── ExtractButton (Phase 2, disabled)
            ├── GuidanceSection (auto-resize textarea)
            ├── LogoSection (Phase 2 placeholder cards)
            ├── ColorSection (swatches + color picker popover)
            ├── FontSection (font name cards)
            └── ImageSection (Phase 2 placeholder cards)
```

### State Management

- 当前选中 Kit → React state (or URL query param `?id=xxx`)
- Kit 列表 / Kit 详情 → fetch + local state (和现有 server-api.ts 模式一致)
- 乐观更新：颜色/名称等轻量编辑直接更新 UI，后台 PATCH

### Key Interactions

| 交互 | 实现 |
|------|------|
| 编辑 Kit 名称 | inline input, blur/Enter → PATCH |
| 编辑 asset 标签 | inline input, blur/Enter → PATCH |
| 添加颜色 | "+" → Popover (react-colorful + name + hex input) → POST asset |
| 编辑颜色 | 色块点击 → 同上 Popover → PATCH asset |
| 删除资产 | hover 更多菜单 → DELETE asset |
| "套用至新专案" | Switch → PATCH kit is_default（服务端原子切换） |
| 设计指南编辑 | textarea input debounce 1s + flush on blur → PATCH kit guidance_text |
| 新建 Kit | POST → 自动选中 |
| 切换 Kit | 侧栏点击 → 加载详情 |

### Empty State

用户无 Kit 时：侧栏显示空状态插图 + "创建你的第一个品牌套件" 引导文案，编辑区显示居中的创建按钮。

### Phase 2 占位

Logo / 字体文件 / 图像的 "+" 按钮在 Phase 1 中渲染但 disabled，显示占位状态。"从文件中提取"按钮同样 disabled。

### Known Limitations (Phase 1)

- 无并发编辑保护（同一用户多 tab 可能冲突，Phase 1 可接受）
- 无批量资产排序 endpoint（排序需逐个 PATCH，后续可加 batch reorder）

## Style Token Mapping

```
Lovart (lo-*)              → Loomic (Tailwind)
─────────────────────────────────────────────
lo-bg-body                 → bg-background
lo-bg-overlay              → bg-secondary / bg-muted
lo-bg-overlay-hover        → hover:bg-accent
lo-text-default            → text-foreground
lo-text-secondary          → text-muted-foreground
lo-text-tertiary           → placeholder:text-muted-foreground
lo-border-neutral-l1       → border-border
lo-border-neutral-l2       → border-input
lo-radius-8               → rounded-lg
lo-radius-10              → rounded-xl
lo-radius-16              → rounded-2xl
lo-body-md                → text-sm (13px)
lo-body-xs                → text-xs (12px)
```

### 固定尺寸

- 侧栏: `w-[260px]`
- 色块: `w-[69px] h-[69px]`
- 资产卡片: `w-[150px] h-[113px]`
- 侧栏缩略图: `aspect-[160/90]`
- 编辑区 header: `h-[96px]`
- 响应式 padding: 默认 `px-6`, `@[1024px]:px-[80px]`, `@[1440px]:px-[160px]`

## Color Picker Component

Base UI Popover 包裹，内部结构:
- 名称输入框 (placeholder: "为颜色命名")
- react-colorful `HexColorPicker` (saturation panel + hue slider)
- 色块预览 (32x32) + hex 输入框 (# + 6位，归一化为大写)
- "取消" + "新增/保存" 按钮

Popover 容器: `w-[260px] rounded-2xl border shadow-lg p-3`

Hex 输入校验：仅接受 `[0-9A-Fa-f]{6}`，拒绝 3 位简写和 alpha 通道。

## File Structure (New Files)

```
# Database
supabase/migrations/YYYYMMDDHHmmss_create_brand_kits.sql

# Shared contracts
packages/shared/src/brand-kit-contracts.ts   (entity + request/response schemas, re-export from index.ts)

# Server
apps/server/src/features/brand-kit/brand-kit-service.ts
apps/server/src/http/brand-kits.ts

# Web
apps/web/src/app/brand-kit/page.tsx
apps/web/src/components/brand-kit/brand-kit-page.tsx
apps/web/src/components/brand-kit/brand-kit-sidebar.tsx
apps/web/src/components/brand-kit/brand-kit-editor.tsx
apps/web/src/components/brand-kit/guidance-section.tsx
apps/web/src/components/brand-kit/color-section.tsx
apps/web/src/components/brand-kit/color-picker-popover.tsx
apps/web/src/components/brand-kit/font-section.tsx
apps/web/src/components/brand-kit/logo-section.tsx
apps/web/src/components/brand-kit/image-section.tsx
apps/web/src/components/brand-kit/asset-card.tsx
apps/web/src/components/brand-kit/inline-input.tsx
apps/web/src/lib/brand-kit-api.ts
```
