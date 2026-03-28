# Loomic Design System Cleanup Spec

**Date:** 2026-03-29
**Goal:** Centralize design tokens, unify shared components, add creative accent colors, improve overall design consistency.

## 1. Design Language

Loomic is an **AI-powered creative workspace**. The design language is:
- **Minimal & Direct** — monochromatic black/white base, generous white space
- **AI-Native** — conversational layout, streaming text, typing indicators
- **Creative accent** — a single vibrant accent color for personality

### Color Palette (based on "Generative Art Platform" + "AI-Native UI")

| Token | Light Mode | Dark Mode (future) | Usage |
|-------|-----------|-------------------|-------|
| `--color-primary` | `#0C0C0D` | `#FAFAFA` | Primary buttons, logos |
| `--color-primary-foreground` | `#FFFFFF` | `#09090B` | Text on primary |
| `--color-accent` | `#6C5CE7` | `#818CF8` | AI accent, creative highlights |
| `--color-accent-foreground` | `#FFFFFF` | `#FFFFFF` | Text on accent |
| `--color-background` | `#FAFAFA` | `#09090B` | Page background |
| `--color-foreground` | `#0C0C0D` | `#FAFAFA` | Primary text |
| `--color-card` | `#FFFFFF` | `#18181B` | Card surfaces |
| `--color-card-foreground` | `#0C0C0D` | `#FAFAFA` | Text on cards |
| `--color-muted` | `#F5F5F5` | `#27272A` | Muted backgrounds |
| `--color-muted-foreground` | `#737373` | `#A1A1AA` | Secondary text |
| `--color-border` | `#E5E5E5` | `#27272A` | Default borders |
| `--color-border-light` | `#F0F0F0` | `#1F1F23` | Subtle borders |
| `--color-input-border` | `#D4D4D4` | `#3F3F46` | Input field borders |
| `--color-destructive` | `#DC2626` | `#DC2626` | Delete, error |
| `--color-ring` | `#6C5CE7` | `#818CF8` | Focus rings |

### Accent Color: `#6C5CE7` (Creative Purple)
A soft purple that conveys creativity and AI intelligence. Used sparingly for:
- Focus rings
- Active navigation indicators
- AI thinking/streaming states
- Creative action buttons (generate, inspire)
- Subtle gradient touches on hero elements

### Typography
Keep current system font stack. No custom fonts needed — Loomic's identity comes from spacing and color, not typeface.

### Spacing Scale (Tailwind defaults)
- `gap-1` (4px) — tight, within button groups
- `gap-1.5` (6px) — compact lists
- `gap-2` (8px) — related elements
- `gap-3` (12px) — section items
- `gap-4` (16px) — standard sections
- `gap-6` (24px) — major sections

### Border Radius Scale
- `rounded-md` (6px) — small elements, pills, tags
- `rounded-lg` (8px) — buttons, inputs
- `rounded-xl` (12px) — cards, containers
- `rounded-2xl` (16px) — large cards, modals

### Shadow Scale
- `shadow-subtle` — `0 1px 3px rgba(0,0,0,0.04)` — default cards
- `shadow-card` — `0 4px 20px rgba(0,0,0,0.04)` — elevated cards
- `shadow-card-hover` — `0 8px 30px rgba(0,0,0,0.08)` — card hover
- `shadow-float` — `0 12px 40px rgba(0,0,0,0.12)` — floating panels, popovers

### Button Sizes
- Icon button: `h-8 w-8` (standard), `h-7 w-7` (compact)
- Text button: `h-8 px-3 text-sm` (standard), `h-9 px-4 text-sm` (large)

## 2. Component Unification Plan

### 2.1 Shared Prompt Input
`HomePrompt` and `ChatInput` share the same core pattern:
- Textarea with auto-resize
- Bottom toolbar with action buttons
- Attachment support
- Submit button

**Action:** Extract shared `PromptTextarea` primitive that both consume.

### 2.2 Replace Hardcoded Colors
Systematically replace all hardcoded hex values with CSS variable references:

| Hardcoded | Replace With |
|-----------|-------------|
| `text-[#0E1014]`, `text-[#141414]`, `text-[#0C0C0D]` | `text-foreground` |
| `text-[#363636]`, `text-[#2F3640]` | `text-foreground` |
| `text-[#525252]` | `text-muted-foreground` |
| `text-[#919191]`, `text-[#A8A8A8]`, `text-[#A4A9B2]`, `text-[#9CA3AF]` | `text-muted-foreground` |
| `bg-[#F7F7F7]`, `bg-[#F5F5F7]`, `bg-[#F2F3F5]` | `bg-muted` |
| `border-[#E3E3E3]`, `border-[#E5E6EC]` | `border-border` |
| `bg-[#2F3640]`, `bg-[#0C0C0D]` | `bg-primary` |
| `hover:bg-black/[0.04]`, `hover:bg-[#0C0C0D0A]` | `hover:bg-muted` |

### 2.3 Markdown Styling
Replace hardcoded colors in `globals.css` `.markdown-content` with Tailwind theme utilities.

### 2.4 Add Accent Color Touches
- Navigation active indicator: accent color underline/dot
- AI streaming cursor: accent color pulse
- Home prompt submit button hover: subtle accent glow
- Focus rings: accent color

## 3. Files to Modify

### globals.css
- Add new CSS variables for the design tokens
- Add shadow utilities
- Fix markdown styling

### Components (color token replacement)
- `apps/web/src/app/(workspace)/home/page.tsx`
- `apps/web/src/components/home-prompt.tsx`
- `apps/web/src/components/chat-input.tsx`
- `apps/web/src/components/chat-message.tsx`
- `apps/web/src/components/chat-sidebar.tsx`
- `apps/web/src/components/canvas-logo-menu.tsx`
- `apps/web/src/components/canvas-ai-toolbar.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/components/project-list.tsx`
- `apps/web/src/components/create-project-dialog.tsx`
- `apps/web/src/components/canvas-editor.tsx`
- `apps/web/src/components/canvas/image-generator-panel.tsx`
- `apps/web/src/components/image-model-preference.tsx`
- `apps/web/src/components/skeletons/home-skeleton.tsx`

### New shared primitives
- Extract `PromptTextarea` from HomePrompt/ChatInput patterns

## 4. Success Criteria

- Zero hardcoded hex colors in component files (all use Tailwind theme classes)
- Consistent button sizes across all toolbars
- Shadow utilities used consistently
- Accent color visible in key interaction points
- Markdown styling uses theme tokens
- No visual regressions — the app should look the same or better
