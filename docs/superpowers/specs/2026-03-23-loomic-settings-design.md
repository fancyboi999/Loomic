# Loomic Settings System Design

> **Status:** Approved. Settings page with profile editing and agent model selection.

**Goal:** Add a settings page that allows users to edit their profile and configure agent model preferences per workspace, migrating core settings functionality from Jaaz.

**Architecture:** New `/settings` route with sidebar navigation, backed by existing Supabase profile table and a new `workspace_settings` table. Server PATCH/GET/PUT endpoints following established patterns.

**Tech Stack:** React 19, Next.js App Router (static export), Tailwind v4, shadcn/ui (base-ui), Supabase.

---

## Scope

**Phase 1 (this spec):**
- Settings page layout with sidebar navigation
- Profile section: edit display name
- Agent section: select default model from available models

**Deferred (Phase 2+):**
- Avatar upload (requires storage bucket work)
- Custom provider API keys (BYOK)
- Workspace management (members, invitations)
- Notification preferences
- Proxy settings (Electron-specific, not applicable to web)
- ComfyUI integration (explicitly deferred)
- i18n (explicitly deferred)

---

## Layout

Settings page as a full-page route (not a dialog):

```
┌──────────────────┬──────────────────────────────────────┐
│  Settings Nav     │  Section Content                     │
│                   │                                      │
│  ● Profile        │  [Profile Form]                      │
│    Agent          │  Display Name: [___________]         │
│                   │  Email: user@example.com (read-only) │
│                   │                                      │
│                   │  [Save]                              │
└──────────────────┴──────────────────────────────────────┘
```

- Left nav: 200px, fixed sections (Profile, Agent)
- Content area: flexible width, max-width 600px
- Back button to return to `/projects`

## Components

### SettingsLayout

Top-level layout with:
- Back navigation to `/projects`
- Sidebar with section links
- Content area for active section
- Active section tracked via React state (no nested routes — static export constraint)

### ProfileSection

Profile editing form:
- **Display Name**: text input, pre-filled from current profile
- **Email**: read-only display (email changes prevented by DB trigger)
- **Save button**: calls PATCH endpoint, shows success/error feedback
- Validation: display name required, 1-100 chars

### AgentSection

Agent model configuration:
- **Default Model**: dropdown select from available models list
- Models sourced from server endpoint (not hardcoded)
- **Save button**: persists to workspace settings
- Shows current model with description

## Database

### New table: `workspace_settings`

```sql
CREATE TABLE public.workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_model text NOT NULL DEFAULT 'gpt-5.4-mini',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

RLS policies:
- SELECT: workspace members can read their workspace settings
- INSERT/UPDATE: workspace owner or admin can modify

Auto-create on first access (upsert pattern).

## API Endpoints

### PATCH /api/viewer/profile

Update current user's profile.

Request:
```json
{ "displayName": "New Name" }
```

Response: `{ "profile": { "id", "email", "displayName", "avatarUrl" } }`

### GET /api/workspace/settings

Get workspace settings for the current user's workspace.

Response:
```json
{
  "settings": {
    "defaultModel": "gpt-5.4-mini"
  }
}
```

### PUT /api/workspace/settings

Update workspace settings.

Request:
```json
{ "defaultModel": "gpt-4o" }
```

Response: same as GET.

### GET /api/models

List available models (derived from server configuration).

Response:
```json
{
  "models": [
    { "id": "gpt-5.4-mini", "name": "GPT-4.1 Mini", "provider": "openai" },
    { "id": "gpt-4o", "name": "GPT-4o", "provider": "openai" }
  ]
}
```

## Integration with Agent

When creating a run, the server resolves the model:
1. Check if workspace has a `default_model` setting
2. Fall back to server env `LOOMIC_AGENT_MODEL`
3. Pass resolved model to agent factory

This requires modifying `createAgentRunService` to accept a workspace context and look up settings.

## State Management

Local React state in the settings page. No external state library.

```typescript
type SettingsPageState = {
  activeSection: "profile" | "agent";
  saving: boolean;
  error: string | null;
  success: boolean;
};
```

## File Structure

```
apps/web/src/
├── app/
│   └── settings/
│       └── page.tsx                ← NEW: settings page
├── components/
│   ├── settings-layout.tsx         ← NEW: layout with sidebar
│   ├── profile-section.tsx         ← NEW: profile form
│   ├── agent-section.tsx           ← NEW: model selection
│   └── ui/
│       └── select.tsx              ← NEW: shadcn select component

apps/server/src/
├── features/
│   └── settings/
│       └── settings-service.ts     ← NEW: workspace settings service
├── http/
│   ├── viewer.ts                   ← MODIFY: add PATCH handler
│   ├── settings.ts                 ← NEW: workspace settings routes
│   └── models.ts                   ← NEW: model list endpoint

packages/shared/src/
├── contracts.ts                    ← MODIFY: add settings schemas
├── http.ts                         ← MODIFY: add settings response schemas

supabase/migrations/
└── 20260323000005_workspace_settings.sql  ← NEW
```

## Scope Exclusions

- Avatar upload (Phase 2)
- Custom provider API keys / BYOK (Phase 2)
- Workspace member management (Phase 2)
- Per-run model override in chat UI (Phase 2)
- Theme selection (already handled by next-themes in header)
