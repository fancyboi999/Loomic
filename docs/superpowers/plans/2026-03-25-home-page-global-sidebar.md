# Implementation Plan: Home Page & Global Sidebar

Spec: `docs/superpowers/specs/2026-03-25-home-page-global-sidebar-design.md`

## Tasks

### Task 1: Create AppSidebar component
- Create `apps/web/src/components/app-sidebar.tsx`
- Icon-only sidebar (w-[60px]) with 4 nav items + logo
- Use SVG icons from spec (Home, Projects, Brand Kit, Settings)
- Active state detection via `usePathname()`
- Logo links to `/home`, Settings at bottom
- Import existing `LoomicLogo` for the top logo

### Task 2: Create workspace layout with auth guard
- Create `apps/web/src/app/(workspace)/layout.tsx`
- Auth guard: redirect to `/login` if no user
- Flex layout: `AppSidebar` + `<main>{children}</main>`
- Loading state while auth resolves

### Task 3: Create HomePrompt component
- Create `apps/web/src/components/home-prompt.tsx`
- Textarea with placeholder "让 Loomic 帮你设计..."
- Toolbar with 6 SVG icon buttons (only submit active, rest placeholder/disabled)
- Submit handler: receives callback `onSubmit(prompt: string)`
- Container styling: rounded-2xl, border, shadow-sm

### Task 4: Create Home page
- Create `apps/web/src/app/(workspace)/home/page.tsx`
- Hero section: Loomic logo + heading + subheading (centered)
- HomePrompt component
- One example category pill
- "最近项目" section: fetch first 4 projects, show cards + "查看全部" link
- Submit flow: createProject → navigate to `/canvas?id={canvasId}&prompt={encoded}`
- Reuse project card rendering from project-list.tsx (extract shared component if needed)

### Task 5: Migrate projects page to workspace route group
- Move `apps/web/src/app/projects/page.tsx` → `apps/web/src/app/(workspace)/projects/page.tsx`
- Remove ProjectSidebar import and rendering
- Remove inline auth guard (layout handles it)
- Keep ProjectList + CreateProjectDialog unchanged
- Page only renders main content area

### Task 6: Migrate brand-kit page to workspace route group
- Move `apps/web/src/app/brand-kit/page.tsx` → `apps/web/src/app/(workspace)/brand-kit/page.tsx`
- Remove auth guard logic from BrandKitPage component
- Remove "← Back" button if present (sidebar handles nav)
- Keep BrandKitSidebar (kit list) and BrandKitEditor

### Task 7: Migrate settings page to workspace route group
- Move `apps/web/src/app/settings/page.tsx` → `apps/web/src/app/(workspace)/settings/page.tsx`
- Remove auth guard logic
- Remove SettingsLayout sidebar nav (profile/agent links)
- Use simple tab buttons or direct sections instead
- Keep Profile and Agent section components

### Task 8: Update root redirect and cleanup
- Update `apps/web/src/app/page.tsx`: redirect `/` → `/home` instead of `/projects`
- Delete `apps/web/src/components/project-sidebar.tsx`
- Verify canvas page still works (not in workspace group, no sidebar)
- Verify login/auth/callback pages unaffected

### Task 9: Canvas prompt handoff
- In `apps/web/src/app/canvas/page.tsx`: read `prompt` query param
- Pass prompt to ChatSidebar as optional prop
- In ChatSidebar: if prompt provided, auto-populate input and submit after init
- Clean URL via `router.replace` after consuming prompt

### Task 10: E2E verification
- Start dev server, verify:
  - `/` redirects to `/home`
  - Home page renders with prompt input, recent projects
  - Sidebar appears on all workspace pages with correct active states
  - Prompt submit creates project and navigates to canvas
  - Canvas page works without sidebar
  - Login page works without sidebar
  - Brand-kit and settings pages work under new layout
