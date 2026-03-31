-- Skills Management System
-- Adds skills registry and per-workspace skill installation

-- =============================================================================
-- 1. skills table (system-wide skill registry)
-- =============================================================================

CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,  -- URL-safe identifier, e.g., "canvas-design"
  description text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT 'system',
  version text NOT NULL DEFAULT '1.0',
  license text,
  category text NOT NULL DEFAULT 'custom'
    CHECK (category IN ('design', 'generation', 'code', 'data', 'writing', 'custom')),
  icon_name text,  -- lucide icon name, e.g., "palette", "sparkles"
  source text NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'community', 'user')),
  skill_content text NOT NULL,  -- Full SKILL.md content
  metadata jsonb DEFAULT '{}'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for listing/search
CREATE INDEX skills_category_idx ON public.skills (category);
CREATE INDEX skills_source_idx ON public.skills (source);
CREATE INDEX skills_created_by_idx ON public.skills (created_by);

-- =============================================================================
-- 2. workspace_skills table (per-workspace installation)
-- =============================================================================

CREATE TABLE public.workspace_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  installed_at timestamptz NOT NULL DEFAULT now(),
  installed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE (workspace_id, skill_id)
);

CREATE INDEX workspace_skills_workspace_idx ON public.workspace_skills (workspace_id);

-- =============================================================================
-- 3. RLS Policies
-- =============================================================================

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_skills ENABLE ROW LEVEL SECURITY;

-- Skills: anyone authenticated can read system/community skills
CREATE POLICY skills_select_all ON public.skills
  FOR SELECT TO authenticated
  USING (source IN ('system', 'community') OR created_by = auth.uid());

-- Skills: users can create their own custom skills
CREATE POLICY skills_insert_user ON public.skills
  FOR INSERT TO authenticated
  WITH CHECK (source = 'user' AND created_by = auth.uid());

-- Skills: users can update/delete their own skills
CREATE POLICY skills_update_user ON public.skills
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY skills_delete_user ON public.skills
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Service role full access
CREATE POLICY skills_service ON public.skills
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Workspace skills: workspace members can read
CREATE POLICY ws_skills_select ON public.workspace_skills
  FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));

-- Workspace skills: workspace admin/owner can manage
CREATE POLICY ws_skills_insert ON public.workspace_skills
  FOR INSERT TO authenticated
  WITH CHECK (private.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY ws_skills_update ON public.workspace_skills
  FOR UPDATE TO authenticated
  USING (private.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY ws_skills_delete ON public.workspace_skills
  FOR DELETE TO authenticated
  USING (private.is_workspace_admin_or_owner(workspace_id));

CREATE POLICY ws_skills_service ON public.workspace_skills
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- 4. updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_skills_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.update_skills_updated_at();

-- =============================================================================
-- 5. Seed system skills
-- =============================================================================

-- Seed canvas-design skill
INSERT INTO public.skills (name, slug, description, author, version, license, category, icon_name, source, skill_content, is_featured, metadata)
VALUES (
  'Canvas Design',
  'canvas-design',
  'Create beautiful visual art as .png and .pdf files using design philosophy. Use when the user asks to create a poster, visual artwork, design piece, or static visual output via code generation.',
  'anthropic',
  '1.0',
  'Apache-2.0',
  'design',
  'palette',
  'system',
  '',  -- Content loaded from filesystem, this is just the registry entry
  true,
  '{"adapted-for": "loomic", "requires": ["execute", "python"]}'::jsonb
);

-- Seed json-image-prompt skill
INSERT INTO public.skills (name, slug, description, author, version, license, category, icon_name, source, skill_content, is_featured, metadata)
VALUES (
  'JSON Image Prompt',
  'json-image-prompt',
  'Use structured JSON prompts for AI image generation instead of free-form text. Produces more consistent, controllable, and high-quality results.',
  'loomic',
  '1.0',
  'Apache-2.0',
  'generation',
  'sparkles',
  'system',
  '',
  true,
  '{"requires": ["generate_image"]}'::jsonb
);
