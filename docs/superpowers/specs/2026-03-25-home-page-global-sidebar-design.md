# Home Page & Global Sidebar Design Spec

## Overview

Add a Home page with AI prompt input and restructure the app to use a global icon-only sidebar for all authenticated pages. Reference: Lovart (`lovart.ai/home`).

## Route Architecture

```
app/
├── (workspace)/              # Route group — shared layout (sidebar + auth guard)
│   ├── layout.tsx            # AppSidebar + auth check + children
│   ├── home/page.tsx         # Home page (prompt + recent projects)
│   ├── projects/page.tsx     # Full project list (moved from app/projects/)
│   ├── brand-kit/page.tsx    # Brand kit management (moved from app/brand-kit/)
│   └── settings/page.tsx     # Settings (moved from app/settings/)
├── canvas/page.tsx           # Canvas editor (no sidebar, full screen)
├── login/page.tsx            # Login page (no sidebar)
├── auth/callback/page.tsx    # OAuth callback (no sidebar)
└── page.tsx                  # / → redirect to /home
```

### `(workspace)/layout.tsx`

- Auth guard: if no user after auth resolves, redirect to `/login`
- Renders: `<div className="flex h-screen"><AppSidebar /><main className="flex-1 overflow-auto">{children}</main></div>`
- Provides auth context to all workspace pages (user/session already available via AuthProvider)

## Component: AppSidebar

File: `components/app-sidebar.tsx`

### Layout

```
┌────┐
│ ✦  │  Loomic Logo (top, links to /home)
│    │  gap
│ 🏠 │  Home      → /home
│ 📁 │  Projects  → /projects
│ 💎 │  Brand Kit → /brand-kit
│    │
│    │  (flex-1 spacer)
│    │
│ 👤 │  Settings  → /settings (bottom)
└────┘
```

### Styling

- Width: `w-[60px]`
- Background: `bg-white border-r border-black/[0.06]`
- Full height: `h-screen flex flex-col items-center py-3 gap-1`
- Logo: `LoomicLogo` component, `size-7`, wrapped in `<Link href="/home">`

### Nav Button Styling

- Size: `h-9 w-9 rounded-full flex items-center justify-center transition-colors`
- Default: `text-black/50 hover:bg-black/[0.04]`
- Active (current route): `bg-black/[0.08] text-black/90`
- Icon size: `w-5 h-5` (20×20 viewBox)
- Tooltip: `title` attribute with page name

### SVG Icons (from Lovart)

**Home** (viewBox 0 0 20 20):
```
M8.69 2.136a2 2 0 0 1 2.62 0l5.655 4.905A3 3 0 0 1 18 9.307v7.194a1.5 1.5 0 0 1-1.5 1.5h-3c-.777 0-1.415-.59-1.493-1.347L12 16.501v-5.188a.6.6 0 0 0-.48-.588l-.12-.011H8.6a.6.6 0 0 0-.6.6V16.5A1.5 1.5 0 0 1 6.5 18h-3A1.5 1.5 0 0 1 2 16.5V9.307c0-.815.332-1.593.915-2.157l.119-.11zm1.769.983a.7.7 0 0 0-.918 0L3.886 8.023A1.7 1.7 0 0 0 3.3 9.307v7.194c0 .11.09.2.2.2h3a.2.2 0 0 0 .2-.2v-5.188a1.9 1.9 0 0 1 1.9-1.9H11.4c1.05.001 1.9.851 1.9 1.9v5.188c0 .11.09.2.2.2h3a.2.2 0 0 0 .2-.2V9.307a1.7 1.7 0 0 0-.587-1.284z
```

**Projects** (viewBox 0 0 20 20):
```
M8.968 2.004c.69.038 1.337.361 1.782.895l1 1.201c.138.166.335.27.548.294l.092.006h3.087A2.523 2.523 0 0 1 18 6.923v8.554l-.013.258a2.524 2.524 0 0 1-2.252 2.252l-.258.013H4.522a2.524 2.524 0 0 1-2.51-2.265L2 15.477V4.522A2.523 2.523 0 0 1 4.522 2H8.83zM3.3 15.477c0 .675.547 1.223 1.222 1.223h10.955c.675 0 1.223-.548 1.223-1.223V9.4H3.3zM4.522 3.3c-.674 0-1.222.547-1.222 1.222V8.1h13.4V6.923c0-.675-.547-1.223-1.223-1.223H12.39a2.14 2.14 0 0 1-1.64-.768l-1-1.2A1.2 1.2 0 0 0 8.83 3.3z
```

**Brand Kit** (viewBox 0 0 18 18):
```
M6.938 1.5c.545 0 1.056.156 1.488.426a2.8 2.8 0 0 1 1.5.375l2.273 1.312c.473.273.837.663 1.076 1.113.45.239.84.603 1.112 1.075L15.7 8.074a2.81 2.81 0 0 1-1.03 3.842l-6.966 4.021A4.125 4.125 0 0 1 1.5 12.376V4.313A2.813 2.813 0 0 1 4.313 1.5zm-.563 10.875a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0m7.175-5.774a2.8 2.8 0 0 1-.321.854l-3.46 5.99 4.339-2.503a1.69 1.69 0 0 0 .617-2.305zM7.5 12.375a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0m-4.875 0a3 3 0 1 0 6 0V4.313a1.684 1.684 0 0 0-1.687-1.688H4.313c-.932 0-1.688.756-1.688 1.688zm7.125-1.144 2.505-4.338a1.685 1.685 0 0 0-.618-2.306L9.6 3.412c.096.283.149.585.149.9z
```

**Profile/Settings** (viewBox 0 0 20 20):
```
M10 1.667a5 5 0 0 1 2.525 9.313c3.355 1.035 5.844 4.047 6.03 7.37.013.22-.167.4-.388.4h-.5a.423.423 0 0 1-.414-.4C17.02 14.982 13.88 11.9 10 11.9s-7.02 3.082-7.252 6.45a.423.423 0 0 1-.414.4h-.501c-.22 0-.4-.18-.389-.4.187-3.323 2.675-6.333 6.029-7.369A5 5 0 0 1 10 1.667m0 1.3a3.7 3.7 0 1 0 .001 7.401A3.7 3.7 0 0 0 10 2.967
```

## Component: Home Page

File: `app/(workspace)/home/page.tsx`

### Layout

```
┌──────────────────────────────────────────┐
│         (centered, max-w-2xl)            │
│                                          │
│            ✦ Loomic (logo + text)         │
│          让创意设计更简单                  │
│      你的 AI 设计助手，从想法到作品        │
│                                          │
│  ┌──────────────────────────────────────┐│
│  │ (HomePrompt component)              ││
│  └──────────────────────────────────────┘│
│                                          │
│  [示例标签 pill]                          │
│                                          │
│  最近项目                    查看全部 →   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│  │+ 新建│ │ proj │ │ proj │ │ proj │    │
│  └──────┘ └──────┘ └──────┘ └──────┘    │
└──────────────────────────────────────────┘
```

### Data Fetching

- `useAuth()` → get token
- `fetchProjects(token)` → display first 4 as recent + "新建项目" card
- Projects already fetched via server API `/api/projects`

### Prompt Submit Flow

1. User types prompt and hits submit
2. Call `createProject(token, { name: prompt.substring(0, 50) })` → get project with canvas
3. Navigate to `/canvas?id={canvasId}&prompt={encodeURIComponent(prompt)}`
4. Canvas page detects `prompt` query param → auto-sends as first chat message

## Component: HomePrompt

File: `components/home-prompt.tsx`

### Structure

- Container: `rounded-2xl border border-neutral-200 bg-white shadow-sm`
- Input: `<textarea>` with placeholder "让 Loomic 帮你设计..."
- Toolbar row below textarea: icon buttons + submit button (right-aligned)

### Toolbar Buttons

| Button | Icon | Status |
|--------|------|--------|
| Attach | Paperclip (SVG_0) | Placeholder (disabled) |
| Inspire | Lightbulb (SVG_1) | Placeholder (disabled) |
| Quick | Lightning (SVG_2) | Placeholder (disabled) |
| Web | Globe (SVG_3) | Placeholder (disabled) |
| Agent | Hexagon (SVG_4) | Placeholder (disabled) |
| Submit | Up arrow (SVG_5) | **Active** — submits prompt |

### Toolbar SVG Paths

**Attach** (paperclip, viewBox 0 0 24 24):
```
M16 1.1A4.9 4.9 0 0 1 20.9 6a4.9 4.9 0 0 1-1.429 3.457h.001l-8.414 8.587-.007.006a2.9 2.9 0 0 1-3.887.193l-.213-.192a2.9 2.9 0 0 1-.007-4.095l8.414-8.586a.9.9 0 0 1 1.286 1.26L8.23 15.216l-.007.006a1.1 1.1 0 0 0 1.556 1.555l8.407-8.579.007-.007a3.1 3.1 0 0 0 .105-4.271l-.105-.112a3.1 3.1 0 0 0-4.384 0L5.4 12.387l-.007.006a5.1 5.1 0 0 0 7.214 7.213l7.749-7.934a.9.9 0 0 1 1.288 1.256l-7.753 7.938q-.005.007-.012.014a6.9 6.9 0 0 1-9.758-9.76l8.408-8.578.007-.007A4.9 4.9 0 0 1 16 1.1
```

**Inspire** (lightbulb, viewBox 0 0 24 24):
```
M15.485 20.14c.284 0 .515.23.515.515 0 .71-.576 1.285-1.286 1.285H9.286c-.71 0-1.286-.575-1.286-1.285 0-.284.23-.515.515-.515zM12 1.334a8 8 0 0 1 4 14.926v1.414c0 .737-.597 1.333-1.333 1.333H9.333A1.333 1.333 0 0 1 8 17.674V16.26a8 8 0 0 1 4-14.927
```

**Quick** (lightning, viewBox 0 0 24 24):
```
M11.675.965c.517-.26 1.263-.444 2.051-.143.784.3 1.217.93 1.432 1.46.213.525.281 1.098.281 1.635V8.98h2.093l.352.015c.864.07 1.997.425 2.513 1.59.553 1.249-.06 2.406-.615 3.088l-6.085 8.208a2 2 0 0 1-.085.106c-.35.405-.778.793-1.287 1.049-.518.26-1.264.444-2.052.142-.783-.3-1.216-.928-1.431-1.459-.214-.524-.282-1.097-.282-1.634V15.02H6.468c-.88 0-2.276-.275-2.866-1.607-.552-1.248.06-2.405.616-3.087l6.085-8.207.084-.106c.35-.405.778-.794 1.287-1.05m1.964 2.952c0-1.602-.851-1.926-1.89-.725L5.664 11.4c-.87 1-.506 1.821.804 1.822H9.36a1 1 0 0 1 1 1v5.864l.01.285c.091 1.26.803 1.53 1.688.646l.193-.207 6.086-8.209c.87-1 .505-1.82-.805-1.82h-2.893l-.102-.005a1 1 0 0 1-.893-.892l-.005-.103z
```

**Web** (globe, viewBox 0 0 24 24):
```
M11.645 1c6.074 0 11 4.925 11 11s-4.926 11-11 11c-6.075 0-11-4.925-11-11s4.925-11 11-11
```

**Agent** (hexagon, viewBox 0 0 24 24):
```
M10.8 1.307a2.33 2.33 0 0 1 2.4 0l7.67 4.602A2.33 2.33 0 0 1 22 7.907v8.361a2.33 2.33 0 0 1-1.13 1.998l-7.67 4.602-.141.078a2.33 2.33 0 0 1-2.258-.078l-7.67-4.602A2.33 2.33 0 0 1 2 16.268V7.907a2.33 2.33 0 0 1 1.003-1.915l.128-.083z
```

**Submit** (up arrow, viewBox 0 0 24 24):
```
M11.293 3.293a1 1 0 0 1 1.414 0l8 8a1 1 0 0 1-1.414 1.414L13 6.414V20a1 1 0 1 1-2 0V6.414l-6.293 6.293a1 1 0 0 1-1.414-1.414z
```

### Example Category Pill

- Single pill for now: "设计" with a small star/sparkle icon
- Style: `rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 cursor-pointer`
- Click: fills prompt with example text like "帮我设计一个现代简约的品牌 Logo"

## Migration: Existing Pages

### projects/page.tsx

- Move to `(workspace)/projects/page.tsx`
- Remove `ProjectSidebar` import and rendering
- Remove auth guard logic (handled by workspace layout)
- Keep `ProjectList` and `CreateProjectDialog` as-is
- Remove inline sidebar layout wrapper — page only renders main content

### brand-kit/page.tsx

- Move to `(workspace)/brand-kit/page.tsx`
- Remove auth guard logic
- Keep `BrandKitSidebar` (kit list sidebar, NOT nav sidebar) and editor
- Remove any "← Back" navigation button (sidebar handles nav now)

### settings/page.tsx

- Move to `(workspace)/settings/page.tsx`
- Remove auth guard logic
- Remove `SettingsLayout` sidebar (nav links) — use tabs or direct sections instead
- Keep Profile and Agent sections

### page.tsx (root)

- Change redirect from `/projects` to `/home`

### Delete

- `components/project-sidebar.tsx` — replaced by AppSidebar

## Canvas Integration

### Prompt Handoff

When Home page creates a project and navigates to canvas with `?prompt=...`:

1. `canvas/page.tsx` reads `searchParams.get("prompt")`
2. If prompt exists, after chat sidebar initializes:
   - Auto-populate the chat input with the prompt
   - Auto-submit as first message
3. Remove `prompt` from URL via `router.replace` (clean URL)

## Styling Reference

### Colors (Lovart-aligned)

- Heading: `text-[#0E1014]`
- Subheading: `text-[#A8A8A8]`
- Sidebar active bg: `bg-black/[0.08]`
- Sidebar hover bg: `bg-black/[0.04]`
- Sidebar icon default: `text-black/50`
- Sidebar icon active: `text-black/90`
- Border: `border-black/[0.06]` or `border-neutral-200`
- Prompt container: `border-neutral-200 bg-white shadow-sm rounded-2xl`
