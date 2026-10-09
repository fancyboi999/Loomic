-- Server-owned thread identity and run bookkeeping.
ALTER TABLE public.chat_sessions
  ADD COLUMN thread_id text;

CREATE UNIQUE INDEX chat_sessions_thread_id_non_null_idx
  ON public.chat_sessions(thread_id)
  WHERE thread_id IS NOT NULL;

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

CREATE INDEX agent_runs_session_id_created_at_idx
  ON public.agent_runs(session_id, created_at DESC);

CREATE INDEX agent_runs_thread_id_created_at_idx
  ON public.agent_runs(thread_id, created_at DESC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
