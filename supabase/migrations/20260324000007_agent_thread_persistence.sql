-- Agent thread persistence infrastructure for LangGraph-backed sessions.
-- Legacy chat sessions may remain without a thread_id; new sessions must set it at the application layer.
-- Official LangGraph Postgres persistence uses a separate server-owned schema.

ALTER TABLE public.chat_sessions
  ADD COLUMN thread_id text;

COMMENT ON COLUMN public.chat_sessions.thread_id IS
  'Server-owned LangGraph thread identifier for new chat sessions.';

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

COMMENT ON TABLE public.agent_runs IS
  'Server-only run bookkeeping for LangGraph thread execution.';

CREATE INDEX agent_runs_session_id_created_at_idx
  ON public.agent_runs(session_id, created_at DESC);

CREATE INDEX agent_runs_thread_id_created_at_idx
  ON public.agent_runs(thread_id, created_at DESC);

CREATE SCHEMA IF NOT EXISTS langgraph;

CREATE TABLE langgraph.checkpoint_migrations (
  v integer PRIMARY KEY
);

CREATE TABLE langgraph.checkpoints (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE langgraph.checkpoint_blobs (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  channel text NOT NULL,
  version text NOT NULL,
  type text NOT NULL,
  blob bytea,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE langgraph.checkpoint_writes (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  task_id text NOT NULL,
  idx integer NOT NULL,
  channel text NOT NULL,
  type text,
  blob bytea NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX checkpoint_writes_lookup_idx
  ON langgraph.checkpoint_writes(thread_id, checkpoint_ns, checkpoint_id);

CREATE TABLE langgraph.store_migrations (
  v integer PRIMARY KEY
);

CREATE TABLE langgraph.store (
  namespace_path text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  PRIMARY KEY (namespace_path, key)
);

CREATE INDEX idx_store_namespace_path
  ON langgraph.store USING btree (namespace_path);

CREATE INDEX idx_store_value_gin
  ON langgraph.store USING gin (value);

CREATE INDEX idx_store_expires_at
  ON langgraph.store USING btree (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION langgraph.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER update_store_updated_at
  BEFORE UPDATE ON langgraph.store
  FOR EACH ROW
  EXECUTE FUNCTION langgraph.update_updated_at_column();

COMMENT ON SCHEMA langgraph IS
  'Server-only LangGraph checkpoint and store persistence schema.';

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.checkpoint_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.checkpoint_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.store_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE langgraph.store ENABLE ROW LEVEL SECURITY;
