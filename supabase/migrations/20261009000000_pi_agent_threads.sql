-- Server-owned Pi transcripts and project files.
CREATE SCHEMA IF NOT EXISTS pi;

CREATE TABLE pi.threads (
  thread_id text PRIMARY KEY,
  messages jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pi.files (
  namespace_path text NOT NULL,
  key text NOT NULL,
  content text NOT NULL,
  PRIMARY KEY (namespace_path, key)
);

ALTER TABLE pi.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi.files ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.chat_sessions.thread_id IS
  'Server-owned agent transcript identifier for chat sessions.';
COMMENT ON TABLE public.agent_runs IS
  'Server-only bookkeeping for agent runs.';
COMMENT ON SCHEMA pi IS 'Server-only Pi agent persistence.';
