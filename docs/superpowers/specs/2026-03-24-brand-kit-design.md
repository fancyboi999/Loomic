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

## Database Schema

```sql
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
  asset_type    TEXT NOT NULL,                 -- 'color' | 'font' | 'logo' | 'image'
  display_name  TEXT NOT NULL DEFAULT '',
  role          TEXT,                          -- 'primary' | 'secondary' | 'title' | 'body' etc.
  sort_order    INT NOT NULL DEFAULT 0,
  text_content  TEXT,                          -- color: '#F0F0F0', font: family name
  file_url      TEXT,                          -- file URL (Phase 2)
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- projects 表增加关联
ALTER TABLE public.projects ADD COLUMN brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL;

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

### Asset Type 存储约定

| asset_type | display_name | text_content | file_url | metadata |
|------------|-------------|-------------|---------|----------|
| `color` | "Cloud" | "#F0F0F0" | null | `{}` |
| `font` | "Feature Display" | font family name | .ttf URL (Phase2) | `{weight, style}` |
| `logo` | "Primary Logo" | null | .png URL (Phase2) | `{width, height}` |
| `image` | "AI Art Style" | null | .png URL (Phase2) | `{width, height}` |

## API Design

Base path: `/api/brand-kits`. Auth: Bearer token (existing pattern).

### Kit CRUD

```
GET    /api/brand-kits                        → 用户所有 Kit 列表
POST   /api/brand-kits                        → 创建 Kit { name }
GET    /api/brand-kits/:kitId                 → Kit 详情 + 所有 assets
PATCH  /api/brand-kits/:kitId                 → 更新 Kit { name?, guidance_text?, is_default? }
DELETE /api/brand-kits/:kitId                 → 删除 Kit (级联删除 assets)
```

### Asset CRUD

```
POST   /api/brand-kits/:kitId/assets          → 添加资产 { asset_type, display_name, text_content?, role? }
PATCH  /api/brand-kits/:kitId/assets/:assetId → 更新资产 { display_name?, text_content?, role?, sort_order? }
DELETE /api/brand-kits/:kitId/assets/:assetId → 删除资产
```

### Project 关联

```
PATCH  /api/projects/:projectId               → 扩展现有接口 { brand_kit_id }
```

### 响应格式

**GET /api/brand-kits:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "My Brand",
      "is_default": true,
      "cover_url": null,
      "asset_counts": { "color": 4, "font": 2, "logo": 0, "image": 0 },
      "created_at": "2026-03-24T12:00:00Z"
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
  "assets": [
    {
      "id": "uuid",
      "asset_type": "color",
      "display_name": "Cloud",
      "role": "primary",
      "text_content": "#F0F0F0",
      "sort_order": 0
    }
  ],
  "created_at": "2026-03-24T12:00:00Z"
}
```

All schemas defined as Zod in `@loomic/shared`.

## Frontend Architecture

### Route

```
/brand-kit → Brand Kit 编辑器 (全屏独立布局)
```

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
| "套用至新专案" | Switch → PATCH kit is_default |
| 设计指南编辑 | textarea blur → PATCH kit guidance_text (debounce) |
| 新建 Kit | POST → 自动选中 |
| 切换 Kit | 侧栏点击 → 加载详情 |

### Phase 2 占位

Logo / 字体文件 / 图像的 "+" 按钮在 Phase 1 中渲染但 disabled，显示占位状态。"从文件中提取"按钮同样 disabled。

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
- 色块预览 (32x32) + hex 输入框 (# + 6位)
- "取消" + "新增/保存" 按钮

Popover 容器: `w-[260px] rounded-2xl border shadow-lg p-3`

## File Structure (New Files)

```
# Database
supabase/migrations/YYYYMMDDHHmmss_create_brand_kits.sql

# Shared contracts
packages/shared/src/brand-kit-contracts.ts

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
