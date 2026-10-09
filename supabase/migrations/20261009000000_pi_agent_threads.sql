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

-- Preserve project workspace files created before the Pi runtime was introduced.
INSERT INTO pi.files (namespace_path, key, content)
SELECT namespace_path, key,
  COALESCE((
    SELECT string_agg(line, E'\n' ORDER BY line_number)
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(value -> 'content') = 'array' THEN value -> 'content' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS lines(line, line_number)
  ), '')
FROM langgraph.store
WHERE namespace_path LIKE 'projects:%'
  AND (expires_at IS NULL OR expires_at > now());

ALTER TABLE pi.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pi.files ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.chat_sessions.thread_id IS
  'Server-owned agent transcript identifier for chat sessions.';
COMMENT ON TABLE public.agent_runs IS
  'Server-only bookkeeping for agent runs.';
COMMENT ON SCHEMA pi IS 'Server-only Pi agent persistence.';
