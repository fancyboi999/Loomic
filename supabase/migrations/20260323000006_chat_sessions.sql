-- Chat sessions and messages for conversation persistence
CREATE TABLE public.chat_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id   uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New Chat',
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_sessions IS 'Chat conversation sessions linked to canvases.';

CREATE INDEX chat_sessions_canvas_id_idx ON public.chat_sessions(canvas_id);

CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

CREATE TABLE public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL DEFAULT '',
  tool_activities jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_messages IS 'Individual chat messages within a session.';

CREATE INDEX chat_messages_session_id_idx ON public.chat_messages(session_id);

-- RLS for chat_sessions
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Members of the workspace that owns the canvas can access sessions
CREATE POLICY chat_sessions_select ON public.chat_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE c.id = chat_sessions.canvas_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY chat_sessions_insert ON public.chat_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.canvases c
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE c.id = chat_sessions.canvas_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY chat_sessions_delete ON public.chat_sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE c.id = chat_sessions.canvas_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY chat_sessions_update ON public.chat_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.canvases c
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE c.id = chat_sessions.canvas_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS for chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      JOIN public.canvases c ON c.id = cs.canvas_id
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE cs.id = chat_messages.session_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      JOIN public.canvases c ON c.id = cs.canvas_id
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE cs.id = chat_messages.session_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY chat_messages_delete ON public.chat_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      JOIN public.canvases c ON c.id = cs.canvas_id
      JOIN public.projects p ON p.id = c.project_id
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE cs.id = chat_messages.session_id
        AND wm.user_id = auth.uid()
    )
  );
