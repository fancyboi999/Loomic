# Loomic Frontend Technical Audit Report

**Date:** 2026-04-07
**Scope:** `apps/web/src/` (152 files, ~26,300 lines)
**Auditor:** Automated technical quality scan

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1/4 | Interactive divs without keyboard support; many buttons missing aria-labels; no skip-nav |
| 2 | Performance | 2/4 | Zero `next/image` usage; inline `<style>` tags in components; landing page is entirely `"use client"` |
| 3 | Theming | 2/4 | ~80+ hardcoded hex colors across 30+ files; dark mode broken in several components |
| 4 | Responsive Design | 2/4 | Canvas page completely non-responsive; chat sidebar has no mobile adaptation |
| 5 | Anti-Patterns | 3/4 | No AI slop; clean aesthetic. Some `any` abuse (62 occurrences) and oversized files |
| **Total** | | **10/20** | **Acceptable (significant work needed)** |

**Rating:** Acceptable -- the codebase has solid architectural foundations but needs targeted investment in accessibility, theming consistency, and responsive support for core workflows.

---

## Anti-Patterns Verdict

**Pass.** This does NOT look AI-generated. The design system has a clear intentional aesthetic: LOVART-inspired minimal black/white creative tool. No cyan-on-dark, no purple-to-blue gradients, no glassmorphism abuse, no hero metric layouts, no identical card grids. The landing page uses tasteful accent glows (oklch-based lime-green) and the workspace UI is clean and functional. The one concern is the hero section's gradient text on the headline (`bg-gradient-to-r ... bg-clip-text text-transparent`), which leans toward the "gradient text for impact" anti-pattern, though it's subtle enough to pass.

---

## Executive Summary

- **Audit Health Score:** 10/20 (Acceptable)
- **Total issues found:** 4 P0, 8 P1, 12 P2, 7 P3
- **Top 5 critical issues:**
  1. Clickable `<div>` elements without `role="button"`, `tabIndex`, or keyboard handlers (P0, a11y)
  2. Zero usage of `next/image` -- all images use raw `<img>` without optimization (P1, performance)
  3. ~80+ hardcoded hex/rgb colors not wired to design tokens, breaking dark mode (P1, theming)
  4. Canvas page and chat sidebar have no mobile/tablet adaptation (P1, responsive)
  5. `chat-message.tsx` at 1,205 lines -- needs decomposition (P1, maintainability)
- **Recommended next steps:** Fix P0 accessibility blockers first, then hardcoded colors, then Image optimization, then responsive canvas.

---

## Detailed Findings by Severity

### P0 -- Blocking

#### [P0-1] Clickable divs without keyboard support

- **Location:** `components/project-list.tsx:37-47` (new project card), `components/project-list.tsx:51-56` (project cards), `app/(workspace)/home/page.tsx:330-370` (recent project cards)
- **Category:** Accessibility
- **Impact:** Keyboard-only and screen reader users cannot interact with project cards. These are the primary navigation elements for entering projects. Users who rely on Tab/Enter navigation are completely blocked.
- **WCAG/Standard:** WCAG 2.1 SC 2.1.1 (Keyboard), SC 4.1.2 (Name, Role, Value)
- **Details:** Project cards are `<div onClick={...}>` with `cursor-pointer` but lack:
  - `role="button"` or `role="link"`
  - `tabIndex={0}`
  - `onKeyDown` handler for Enter/Space
- **Recommendation:** Convert to `<button>` or `<a>` elements. Since they navigate to a URL, `<Link>` from `next/link` is the semantic correct choice. If keeping as `<div>`, add `role="link"`, `tabIndex={0}`, and keyboard handler.
- **Suggested command:** `/harden`

#### [P0-2] Missing focus indicators on interactive elements

- **Location:** `components/chat-sidebar.tsx:785-799` (collapsed chat toggle), `components/canvas-tool-menu.tsx:395-440` (tool buttons), `components/session-selector.tsx` (session items), `components/canvas-layers-panel.tsx:122-131` (visibility/lock buttons with `tabIndex={-1}`)
- **Category:** Accessibility
- **Impact:** Users navigating with keyboard cannot see which element is focused. The canvas layer panel buttons explicitly set `tabIndex={-1}` removing them from tab order entirely.
- **WCAG/Standard:** WCAG 2.1 SC 2.4.7 (Focus Visible)
- **Details:** Many custom `<button>` elements use only `hover:` Tailwind variants without corresponding `focus-visible:` styles. The global CSS applies `outline-ring/50` on `*`, which provides a baseline, but many components override or suppress focus styles.
- **Recommendation:** Add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to all interactive elements. Remove `tabIndex={-1}` from canvas layer panel action buttons.
- **Suggested command:** `/harden`

#### [P0-3] Chat textarea missing accessible label

- **Location:** `components/chat-input.tsx:249-259`
- **Category:** Accessibility
- **Impact:** The main chat textarea has `placeholder` text but no associated `<label>` or `aria-label`. Screen readers announce it as an unlabeled text field. This is the primary input for the entire application.
- **WCAG/Standard:** WCAG 2.1 SC 1.3.1 (Info and Relationships), SC 4.1.2 (Name, Role, Value)
- **Recommendation:** Add `aria-label="Message input"` to the textarea element.
- **Suggested command:** `/harden`

#### [P0-4] Landing page is entirely `"use client"` defeating SSR/SEO

- **Location:** `app/page.tsx:1`
- **Category:** Performance / SEO
- **Impact:** The landing page (`/`) is the public-facing marketing page. Marking it `"use client"` means no server-side rendering -- search engines see an empty shell until JS loads. This directly impacts SEO indexing, Core Web Vitals (LCP, FID), and initial page load performance.
- **Details:** The page imports 9 landing components, all also `"use client"`. Much of the content (feature text, pricing data, testimonials) is static and could be server-rendered.
- **Recommendation:** Remove `"use client"` from `app/page.tsx`. Keep individual interactive components (FloatingNav, TypewriterText) as client components via composition. Static sections (FeatureShowcase, HowItWorks, PricingPreview, LandingFooter) should be server components wrapping minimal client interactive parts.
- **Suggested command:** `/optimize`

---

### P1 -- Major

#### [P1-1] Zero usage of `next/image` -- all images use raw `<img>`

- **Location:** All 40+ `<img>` tags across the codebase, notably:
  - `components/landing/hero-section.tsx:114-119` (hero image, loading="eager" but no size optimization)
  - `components/landing/feature-showcase.tsx:22-27` (4 showcase images)
  - `components/landing/showcase-gallery.tsx:82-87` (gallery items)
  - `components/project-list.tsx:75-83` (project thumbnails)
  - `app/(workspace)/home/page.tsx:351-357` (recent project cards)
- **Category:** Performance
- **Impact:** Without `next/image`, images are not automatically optimized (no WebP/AVIF conversion, no responsive srcset, no lazy loading below the fold, no blur placeholder). On the landing page alone, this means 5+ full-resolution JPGs loaded without size negotiation. On the workspace home page, project thumbnails are loaded at full resolution regardless of display size.
- **Recommendation:** Replace `<img>` with `<Image>` from `next/image` for all static/known-dimension images. For dynamic images (canvas thumbnails, AI-generated), use `<img>` with explicit `width`/`height` and `loading="lazy"`.
- **Suggested command:** `/optimize`

#### [P1-2] Hardcoded hex colors breaking dark mode

- **Location:** 80+ occurrences across 30+ files. Major offenders:
  - `components/chat-input.tsx:318` -- send button `bg-[#2F3640]`, `hover:bg-[#4A535F]`, `active:bg-[#191E26]`
  - `components/chat-skills.tsx:84,93,95` -- `text-[#2F3640]`, `bg-white`, `text-[#666]`
  - `components/canvas-image-picker.tsx:115,117,127,141,152,156,160,166,187,197,207,213` -- entire component uses hardcoded white bg, gray borders `border-[#E3E3E3]`, gray text `text-[#A4A9B2]`, `text-[#2F3640]`, `text-[#8A8F98]`
  - `components/canvas-tool-menu.tsx:402-436,504-517` -- `text-[#1b1b1f]`, `bg-[#F3F4F6]`, `text-[#D1D5DB]`, `text-[#6B7280]`, `text-[#9CA3AF]`
  - `components/session-selector.tsx:139,148,165` -- `text-[#2F3640]`
  - `components/editable-project-name.tsx:72,82` -- `bg-white/80`, `text-[#0E1014]`
  - `components/image-attachment-bar.tsx:19,29,62` -- `border-[#E3E3E3]`, `bg-[#F7F7F7]`, `text-[#A4A9B2]`
  - `components/not-found.tsx:6-10` -- `text-[#0E1014]`, `text-[#A8A8A8]`
  - `components/delete-project-dialog.tsx:28,43` -- `text-[#0E1014]`, `bg-[#FF595B]`
  - `components/canvas-image-gen-panel.tsx:63,66,85` -- `text-[#2F3640]`, `text-[#A4A9B2]`
  - `components/toast.tsx:104,112,120` -- `bg-[#0E1014]`
  - `components/chat-message.tsx:1042-1043` -- code block `bg-[#1E1E1E]`, `text-[#D4D4D4]`
- **Category:** Theming
- **Impact:** In dark mode, hardcoded light-theme colors (white backgrounds, dark-on-light text) remain unchanged, creating invisible text, broken contrast, and a jarring visual experience. The `canvas-image-picker` is completely unusable in dark mode (white bg on dark background). The `not-found` page is invisible in dark mode.
- **WCAG/Standard:** WCAG 2.1 SC 1.4.3 (Contrast Minimum)
- **Recommendation:** Replace all hardcoded colors with design token references:
  - `bg-[#2F3640]` -> `bg-primary`
  - `text-[#2F3640]` -> `text-foreground`
  - `text-[#A4A9B2]` / `text-[#666]` -> `text-muted-foreground`
  - `border-[#E3E3E3]` -> `border-border`
  - `bg-white` -> `bg-card` or `bg-background`
  - `bg-[#F7F7F7]` / `bg-[#F5F5F7]` -> `bg-muted`
  - `bg-[#0E1014]` -> `bg-foreground` (for inverted contexts)
  - `bg-[#FF595B]` -> `bg-destructive`
- **Suggested command:** `/colorize` then `/normalize`

#### [P1-3] Canvas page has no mobile/tablet adaptation

- **Location:** `app/canvas/page.tsx:250` -- `flex h-screen w-screen overflow-hidden`, `components/chat-sidebar.tsx:803-812` -- fixed pixel width sidebar
- **Category:** Responsive Design
- **Impact:** The canvas page uses a side-by-side layout (Excalidraw + ChatSidebar) with the chat sidebar at a fixed 400px width. On screens < 700px, the canvas area becomes too narrow to use. There are no breakpoints, no stacking, no drawer pattern. Mobile users cannot effectively use the core product experience.
- **Details:** The chat sidebar uses `style={{ width: sidebarWidth }}` with a mouse-based resize handle (`onMouseDown`). This is completely unusable on touch devices.
- **Recommendation:** Implement a responsive canvas layout:
  - Mobile (<768px): Chat as full-screen overlay/drawer triggered by the existing toggle button
  - Tablet (768-1024px): Chat as collapsible drawer overlaying canvas
  - Desktop (>1024px): Current side-by-side layout
  - Replace mouse-only resize handle with touch-compatible gesture
- **Suggested command:** `/adapt`

#### [P1-4] `chat-message.tsx` is 1,205 lines -- exceeds maintainability threshold

- **Location:** `components/chat-message.tsx` (1,205 lines)
- **Category:** Anti-Pattern / Maintainability
- **Impact:** This single file contains the ImageLightbox component (extracted duplicate at `components/chat/image-lightbox.tsx` exists but the old one remains), markdown rendering configuration, tool call UI, thinking block UI, image artifacts, video artifacts, brand kit mention display, and 6 utility functions. It's difficult to review, test, or modify without risk.
- **Details:** There is already a `components/chat/image-lightbox.tsx` (423 lines), suggesting a partial extraction was started but the original was not cleaned up.
- **Recommendation:** Decompose into:
  - `chat/message-text.tsx` -- markdown rendering
  - `chat/message-tool-call.tsx` -- tool invocation UI
  - `chat/message-thinking.tsx` -- thinking block
  - `chat/message-image-artifact.tsx` -- image generation results
  - `chat/message-video-artifact.tsx` -- video results
  - `chat/message-brand-kit.tsx` -- brand kit mention display
  - Remove the duplicated ImageLightbox from `chat-message.tsx` (use the one in `chat/image-lightbox.tsx`)
- **Suggested command:** `/extract`

#### [P1-5] `app-sidebar.tsx:213` -- logo hardcoded to `text-black`, invisible in dark mode

- **Location:** `components/app-sidebar.tsx:213`
- **Category:** Theming
- **Impact:** The Loomic logo in the desktop sidebar uses `text-black` which becomes invisible against the dark mode sidebar background (`oklch(0.205 0 0)`). This is the brand's primary visual identifier.
- **Recommendation:** Change to `text-foreground` or add dark mode variant: `text-black dark:text-white`.
- **Suggested command:** `/normalize`

#### [P1-6] `home/page.tsx:241` -- same logo dark mode issue

- **Location:** `app/(workspace)/home/page.tsx:241`
- **Category:** Theming
- **Impact:** Same `text-black` on LoomicLogo, invisible in dark mode on the home page greeting section.
- **Recommendation:** Change to `text-foreground`.
- **Suggested command:** `/normalize`

#### [P1-7] Inline `<style>` tags in landing components cause render-blocking recalculation

- **Location:**
  - `components/landing/hero-section.tsx:219-261` -- 42 lines of CSS including keyframes
  - `components/landing/how-it-works.tsx:145`
  - `components/landing/pricing-preview.tsx:183`
  - `components/landing/final-cta.tsx:101`
- **Category:** Performance
- **Impact:** Inline `<style>` tags inject CSS on every render, causing style recalculation. The hero section alone has 4 `@keyframes` definitions and dark mode overrides inside a React component. These should be in `globals.css` or a separate CSS module.
- **Recommendation:** Move all keyframe animations to `globals.css` (a comment at line 386 of `globals.css` even says "Landing page keyframes -- consolidated from inline `<style>` tags" but the consolidation was never completed). Define `@utility` or custom classes for the animations.
- **Suggested command:** `/optimize`

#### [P1-8] 62 `any` type annotations across 16 files

- **Location:** Concentrated in canvas-related files:
  - `components/canvas-editor.tsx` -- 12 occurrences (excalidrawApi, elements, appState)
  - `components/canvas-tool-menu.tsx` -- 7 occurrences
  - `lib/canvas-image-generator.ts` -- 9 occurrences
  - `lib/canvas-video-generator.ts` -- 9 occurrences
  - `app/canvas/page.tsx` -- 4 occurrences (`excalidrawApiRef: useRef<any>`)
  - `components/login-form.tsx:16-23` -- animation variants cast `as any`
- **Category:** Anti-Pattern (TypeScript)
- **Impact:** Loss of type safety in critical paths. The Excalidraw API interactions especially benefit from proper typing to catch breaking changes during library upgrades. The `as any` casts on animation variants are unnecessary as Framer Motion has proper `Variants` types.
- **Recommendation:** Create a `types/excalidraw.d.ts` with interfaces for ExcalidrawAPI, ExcalidrawElement, and AppState. Replace `any` with proper Excalidraw types from `@excalidraw/excalidraw`. For animation variants, use `Variants` type from Framer Motion.
- **Suggested command:** `/harden`

---

### P2 -- Minor

#### [P2-1] No skip navigation link

- **Location:** `app/layout.tsx`, `app/(workspace)/layout.tsx`
- **Category:** Accessibility
- **Impact:** Screen reader users must tab through the entire sidebar navigation on every page before reaching main content.
- **WCAG/Standard:** WCAG 2.1 SC 2.4.1 (Bypass Blocks)
- **Recommendation:** Add a visually-hidden skip link as the first focusable element in the layout: `<a href="#main" className="sr-only focus:not-sr-only ...">Skip to content</a>` and add `id="main"` to the `<main>` element.
- **Suggested command:** `/harden`

#### [P2-2] Every page route is `"use client"` -- no server components leveraged

- **Location:** All 20 page/layout files in `app/` have `"use client"` directive
- **Category:** Performance
- **Impact:** The entire application is client-rendered. No benefit from React Server Components for data fetching, reduced JS bundle, or streaming. Static pages like pricing, settings layouts, and the not-found page gain nothing from being client components.
- **Recommendation:** Audit each page to determine if `"use client"` is truly needed. Good candidates for server components:
  - `app/not-found.tsx` -- purely static, no hooks/state
  - `app/pricing/page.tsx` -- static pricing data
  - Workspace layout skeleton states
- **Suggested command:** `/optimize`

#### [P2-3] `formatDate` utility duplicated

- **Location:** `components/project-list.tsx:110-116` and `app/(workspace)/home/page.tsx:67-73`
- **Category:** Anti-Pattern (DRY)
- **Impact:** Identical `formatDate` function copy-pasted. Any date formatting change requires updating two locations.
- **Recommendation:** Extract to `lib/utils.ts` or a dedicated `lib/date.ts`.
- **Suggested command:** `/extract`

#### [P2-4] Chat sidebar resize handle is mouse-only

- **Location:** `components/chat-sidebar.tsx:173-197`
- **Category:** Responsive Design / Accessibility
- **Impact:** The resize handle uses `onMouseDown`/`mousemove`/`mouseup` events. Touch devices cannot use it. No keyboard resize support either. The handle also has no ARIA role or label.
- **Recommendation:** Add touch event handlers (`onTouchStart`/`touchmove`/`touchend`). Add `role="separator"` with `aria-orientation="vertical"` and `aria-valuenow` for the current width. Add keyboard support (arrow keys to resize).
- **Suggested command:** `/harden`

#### [P2-5] `canvas-image-picker.tsx` completely ignores dark mode

- **Location:** `components/canvas-image-picker.tsx:115,117,127,141,152,156,160,166,187,197,207,213`
- **Category:** Theming
- **Impact:** The entire mention picker uses hardcoded `bg-white`, `border-[#E3E3E3]`, `text-[#2F3640]`, `text-[#A4A9B2]`, `text-[#8A8F98]`, `bg-[#F5F5F7]`, `text-[#6B7280]`. In dark mode, this component appears as a bright white rectangle against a dark background, with all text colors designed for light backgrounds.
- **Recommendation:** Replace every hardcoded color with token equivalents. This component needs a complete theming pass.
- **Suggested command:** `/colorize`

#### [P2-6] Missing `aria-live` region for streaming chat messages

- **Location:** `components/chat-sidebar.tsx:866-889` (message area)
- **Category:** Accessibility
- **Impact:** When AI responses stream in, screen readers are not notified of new content. The message area should announce new messages as they appear.
- **Recommendation:** Add `aria-live="polite"` to the message container, or add an `aria-live` region specifically for the latest message.
- **Suggested command:** `/harden`

#### [P2-7] Shadow utilities use hardcoded `rgba()` instead of tokens

- **Location:** `app/globals.css:154-165` -- `shadow-subtle`, `shadow-card`, `shadow-card-hover`, `shadow-float` all use `rgba(0, 0, 0, ...)`
- **Category:** Theming
- **Impact:** Box shadows don't adapt to the theme. In dark mode, black shadows on dark backgrounds are invisible. In light mode on colored backgrounds, pure black shadows can look harsh.
- **Recommendation:** Use CSS custom properties for shadow colors, or use Tailwind's shadow color utilities with token values.
- **Suggested command:** `/normalize`

#### [P2-8] `login-form.tsx` and `register-form.tsx` -- checkmark circle uses hardcoded `bg-black`

- **Location:** `components/login-form.tsx:130`, `components/register-form.tsx:96`
- **Category:** Theming
- **Impact:** The success checkmark animation circle uses `bg-black` which doesn't adapt to dark mode. In dark mode, the black circle is invisible against the dark background.
- **Recommendation:** Replace with `bg-foreground` and `text-background`.
- **Suggested command:** `/normalize`

#### [P2-9] `chat-skills.tsx` uses hardcoded light-only colors

- **Location:** `components/chat-skills.tsx:84,93,95`
- **Category:** Theming
- **Impact:** The skills suggestions panel uses `bg-white`, `text-[#2F3640]`, `border-[rgba(0,0,0,0.07)]`, `text-[#666]` -- all light-mode-only colors. In dark mode the white buttons appear jarringly bright.
- **Recommendation:** Replace with token-based colors.
- **Suggested command:** `/colorize`

#### [P2-10] `home-example-browser.tsx:42` uses hardcoded accent color `#dbeb56`

- **Location:** `components/home-example-browser.tsx:42`, `components/agent-model-selector.tsx:119`
- **Category:** Theming
- **Impact:** The accent color `#dbeb56` is used directly instead of the `--accent` CSS variable. If the accent color ever changes, these components won't update.
- **Recommendation:** Use `bg-accent`, `border-accent`, `text-accent-foreground` instead of hardcoded hex.
- **Suggested command:** `/normalize`

#### [P2-11] `font-picker-dialog.tsx` uses hardcoded `bg-white` and custom overlay

- **Location:** `components/brand-kit/font-picker-dialog.tsx:93,95`
- **Category:** Theming
- **Impact:** The font picker dialog uses `bg-white` for its content and `bg-black/30` for overlay. It doesn't use the standard Dialog component from shadcn/ui, creating visual inconsistency. In dark mode, the white dialog body is jarring.
- **Recommendation:** Refactor to use the existing `Dialog` component from `components/ui/dialog.tsx`, which handles proper theming, overlay, and accessibility.
- **Suggested command:** `/normalize`

#### [P2-12] `project-list.tsx` -- project cards are divs, should be links

- **Location:** `components/project-list.tsx:50-96`
- **Category:** Accessibility / SEO
- **Impact:** Project cards use `<div onClick={router.push(...)}>` instead of `<Link href={...}>`. This means: no right-click "Open in new tab", no link semantics for screen readers, no browser prefetching.
- **Recommendation:** Wrap each project card in `<Link>` from `next/link`. Keep the delete button with `e.stopPropagation()`.
- **Suggested command:** `/harden`

---

### P3 -- Polish

#### [P3-1] `requestIdleCallback` used without fallback

- **Location:** `components/canvas-editor.tsx:156`
- **Category:** Performance / Compatibility
- **Impact:** `requestIdleCallback` is not available in Safari. The normalization pass will silently fail on Safari/iOS.
- **Recommendation:** Add a simple polyfill: `const ric = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1));`

#### [P3-2] `canvas-bottom-bar.tsx:8` -- color presets use hardcoded hex

- **Location:** `components/canvas-bottom-bar.tsx:8`
- **Category:** Theming
- **Impact:** Canvas background color presets (`#000000`, `#FFFFFF`, `#d3f256`, etc.) are functional values, not theme colors. These are intentionally hardcoded for the canvas background picker. No fix needed, but worth noting.

#### [P3-3] `hero-section.tsx` inline styles for hover effects

- **Location:** `components/landing/hero-section.tsx:309-321`
- **Category:** Performance
- **Impact:** The CTA button uses `onMouseEnter`/`onMouseLeave` handlers to imperatively set `boxShadow` style. This creates unnecessary JS execution on hover. CSS `:hover` pseudo-class would be more efficient.
- **Recommendation:** Use Tailwind's `hover:shadow-[...]` or a custom `@utility` in globals.css.

#### [P3-4] Toast provider uses module-level mutable `let nextId = 0`

- **Location:** `components/toast.tsx:37`
- **Category:** Anti-Pattern
- **Impact:** Module-level mutable state survives across hot reloads and can cause stale ID conflicts in development. Low risk in production.
- **Recommendation:** Use `useRef` for the ID counter inside the provider, or use `crypto.randomUUID()`.

#### [P3-5] `3 eslint-disable` comments

- **Location:**
  - `hooks/use-chat-sessions.ts:197` -- `react-hooks/exhaustive-deps`
  - `app/canvas/page.tsx:224` -- `react-hooks/exhaustive-deps`
  - `components/landing/feature-showcase.tsx:107` -- `@typescript-eslint/no-explicit-any`
- **Category:** Anti-Pattern
- **Impact:** Suppressed lint rules may hide real bugs. The `exhaustive-deps` suppressions in particular are known to cause stale closure bugs.
- **Recommendation:** Review each suppression. The `exhaustive-deps` ones likely use ref patterns (accessTokenRef) correctly, but should be documented with a comment explaining why the suppression is safe.

#### [P3-6] `alt=""` on decorative images is correct but inconsistent

- **Location:** `components/project-list.tsx:77`, `components/canvas-files-panel.tsx:107`, `components/canvas-layers-panel.tsx:79`, `components/home-example-browser.tsx:100`
- **Category:** Accessibility
- **Impact:** Some images use `alt=""` (correct for decorative), some use `alt="Attachment"` (generic), and some use contextual alt text. The pattern is inconsistent.
- **Recommendation:** Audit all images: decorative images should have `alt=""`, informational images should have descriptive alt text. Project thumbnails (`alt=""`) should ideally be `alt={project.name}`.

#### [P3-7] `globals.css` has duplicate `@keyframes shimmer`

- **Location:** `app/globals.css:172-174` and `app/globals.css:241-243` (inside hero-section inline style, but the globals one also exists)
- **Category:** Performance
- **Impact:** Two `shimmer` keyframe definitions. The inline one in hero-section overrides the globals one within that component scope. Minor CSS bloat.
- **Recommendation:** Remove the duplicate and use the globals.css version consistently.

---

## Patterns and Systemic Issues

### 1. Hardcoded colors are systemic, not one-off

Hardcoded hex values appear in **30+ files** with **80+ occurrences**. The most common offenders are a consistent palette that was clearly designed for light mode only:
- `#2F3640` (dark gray text) -- 8 files
- `#E3E3E3` (light border) -- 6 files
- `#A4A9B2` (muted text) -- 5 files
- `#0E1014` (near-black text) -- 4 files
- `#F5F5F7` / `#F7F7F7` (light background) -- 3 files

These map 1:1 to existing design tokens (`foreground`, `border`, `muted-foreground`, `foreground`, `muted`). This suggests the component authors were unaware of or chose not to use the token system.

### 2. `"use client"` everywhere defeats Next.js App Router benefits

All 20 page routes use `"use client"`. This means zero server-side rendering, zero streaming, and the full React bundle shipped for every page. The App Router's primary advantage (server components by default) is completely unused.

### 3. All images use raw `<img>` -- `next/image` is never imported

The `next/image` component is not imported anywhere in the codebase. This is a significant missed optimization for a visually-heavy creative tool. Landing page LCP is directly impacted.

### 4. Canvas-related components uniformly typed as `any`

The Excalidraw API interactions across `canvas-editor.tsx`, `canvas-tool-menu.tsx`, `canvas-layers-panel.tsx`, `canvas-files-panel.tsx`, `canvas-bottom-bar.tsx`, `canvas-logo-menu.tsx`, `canvas-empty-hint.tsx`, and `canvas/page.tsx` all use `any` for the Excalidraw API and element types. This is a single systemic decision that should be fixed with a shared type file.

---

## Positive Findings

1. **Well-structured design token system.** The `globals.css` uses oklch colors with a complete light/dark token set. The foundation for consistent theming exists -- it's just not used everywhere.

2. **Proper ref patterns for accessToken.** The codebase correctly uses `useRef` for access tokens to avoid stale closures and unnecessary re-renders (e.g., `accessTokenRef.current` pattern in `canvas-editor.tsx`, `chat-sidebar.tsx`).

3. **ErrorBoundary component.** A well-implemented error boundary exists at `components/error-boundary.tsx` with custom fallback support, reset capability, and proper error logging. It's used around critical components (Excalidraw, chat messages).

4. **WebSocket reconnection with exponential backoff.** The `useWebSocket` hook implements proper reconnection logic with exponential backoff, connection deduplication (React Strict Mode aware), and RPC handler support.

5. **Dynamic import for Excalidraw.** The heavy Excalidraw library is loaded via `dynamic()` with `{ ssr: false }`, correctly avoiding server-side rendering of a browser-only library.

6. **Canvas save with beforeunload flush.** The canvas editor implements robust data persistence with debounced saves, pending save tracking, and `keepalive: true` fetch on page close.

7. **Proper mobile bottom navigation.** The `AppSidebar` component implements a dual layout (desktop sidebar rail + mobile bottom bar) with proper `48px` touch targets and `safe-area-inset-bottom` padding.

8. **Semantic HTML in auth forms.** The login and register forms use proper `<form>`, `<label>`, `<input>` with `htmlFor`/`id` associations, and `role="alert"` for error messages.

9. **Landing page lazy loading.** Below-the-fold images on the landing page correctly use `loading="lazy"`, and the hero image uses `loading="eager"`.

10. **Clean animation patterns.** Framer Motion is used consistently with tasteful easing curves (`[0.25, 0.46, 0.45, 0.94]`), no bounce effects, and layout animations for the sidebar active indicator.

---

## Recommended Actions

Priority-ordered commands to address findings:

1. **[P0] `/harden`** -- Fix all a11y blockers: add keyboard support to clickable divs, add aria-labels to chat textarea, add focus indicators, add skip-nav link, add aria-live for streaming messages (P0-1, P0-2, P0-3, P2-1, P2-4, P2-6, P2-12)

2. **[P0] `/optimize`** -- Convert landing page to server components, eliminate inline `<style>` tags, implement `next/image` for all static images (P0-4, P1-1, P1-7, P2-2)

3. **[P1] `/normalize`** -- Replace all hardcoded colors with design tokens, fix dark mode for logo, shadows, auth forms (P1-2, P1-5, P1-6, P2-7, P2-8, P2-10, P2-11)

4. **[P1] `/adapt`** -- Implement responsive canvas layout with mobile drawer pattern, touch-compatible resize handle (P1-3)

5. **[P1] `/extract`** -- Decompose `chat-message.tsx` into focused sub-components, extract shared utilities like `formatDate` (P1-4, P2-3)

6. **[P1] `/colorize`** -- Fix dark mode for `canvas-image-picker`, `chat-skills`, `canvas-image-gen-panel`, and all remaining hardcoded-color components (P2-5, P2-9)

7. **[P2] `/harden`** -- Create Excalidraw type definitions, eliminate `any` usage in canvas components (P1-8)

8. **[P3] `/polish`** -- Final pass for alt text consistency, duplicate keyframes, module-level state, requestIdleCallback polyfill (P3-1 through P3-7)

---

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/audit` after fixes to see your score improve.
