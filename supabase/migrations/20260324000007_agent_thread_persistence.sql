-- Agent thread persistence infrastructure for LangGraph-backed sessions.
-- Legacy chat sessions may remain without a thread_id; new sessions must set it at the application layer.

ALTER TABLE public.chat_sessions
  ADD COLUMN thread_id text;

COMMENT ON COLUMN public.chat_sessions.thread_id IS
  'Server-owned LangGraph thread identifier for new chat sessions.';

CREATE UNIQUE INDEX chat_sessions_thread_id_non_null_idx ON public.chat_sessions(thread_id) WHERE thread_id IS NOT NULL;

CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'running', 'completed', 'failed')),
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text,
  error_message text
);

COMMENT ON TABLE public.agent_runs IS
  'Server-only run bookkeeping for LangGraph thread execution.';

CREATE INDEX agent_runs_session_id_created_at_idx
  ON public.agent_runs(session_id, created_at DESC);

CREATE INDEX agent_runs_thread_id_created_at_idx
  ON public.agent_runs(thread_id, created_at DESC);

CREATE TABLE public.agent_checkpoints (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  parent_checkpoint_id text,
  payload jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id),
  CONSTRAINT agent_checkpoints_parent_fkey
    FOREIGN KEY (thread_id, checkpoint_ns, parent_checkpoint_id)
    REFERENCES public.agent_checkpoints(thread_id, checkpoint_ns, checkpoint_id)
    ON DELETE SET NULL
);

COMMENT ON TABLE public.agent_checkpoints IS
  'Server-only LangGraph checkpoint payloads stored by thread.';

CREATE INDEX agent_checkpoints_thread_id_created_at_idx
  ON public.agent_checkpoints(thread_id, created_at DESC);

CREATE TABLE public.agent_checkpoint_writes (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  task_id text NOT NULL,
  idx integer NOT NULL,
  channel text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx),
  CONSTRAINT agent_checkpoint_writes_checkpoint_fkey
    FOREIGN KEY (thread_id, checkpoint_ns, checkpoint_id)
    REFERENCES public.agent_checkpoints(thread_id, checkpoint_ns, checkpoint_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.agent_checkpoint_writes IS
  'Server-only LangGraph pending writes linked to checkpoints.';

CREATE INDEX agent_checkpoint_writes_thread_id_idx
  ON public.agent_checkpoint_writes(thread_id);

CREATE TABLE public.agent_store_items (
  namespace text[] NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);

COMMENT ON TABLE public.agent_store_items IS
  'Server-only LangGraph store items for long-term memory namespaces.';

CREATE INDEX agent_store_items_namespace_idx
  ON public.agent_store_items
  USING GIN (namespace);

CREATE TRIGGER agent_store_items_updated_at
  BEFORE UPDATE ON public.agent_store_items
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_checkpoint_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_store_items ENABLE ROW LEVEL SECURITY;
