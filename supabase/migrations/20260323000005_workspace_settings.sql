-- Workspace-level settings (agent model, preferences)
CREATE TABLE public.workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  default_model text NOT NULL DEFAULT 'gpt-4.1-mini',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.workspace_settings IS 'Per-workspace configuration for agent defaults.';
COMMENT ON COLUMN public.workspace_settings.default_model IS 'Default LLM model identifier for agent runs.';

-- updated_at trigger (reuses the existing moddatetime extension from foundation migration)
CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON public.workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- RLS
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

-- Members can read their workspace settings
CREATE POLICY workspace_settings_select ON public.workspace_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Owner or admin can insert settings
CREATE POLICY workspace_settings_insert ON public.workspace_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Owner or admin can update settings
CREATE POLICY workspace_settings_update ON public.workspace_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );
