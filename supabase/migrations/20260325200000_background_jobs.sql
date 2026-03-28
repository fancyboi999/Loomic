-- Background Jobs: business state for async tasks.
-- pgmq handles message delivery; this table handles product-visible status.

-- Status enum
CREATE TYPE public.background_job_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'dead_letter'
);

-- Job type enum (extensible)
CREATE TYPE public.background_job_type AS ENUM (
  'image_generation'
);

-- Main table
CREATE TABLE public.background_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id),
  project_id    uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  canvas_id     uuid REFERENCES public.canvases(id) ON DELETE SET NULL,
  session_id    uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  thread_id     text,

  queue_name    text NOT NULL,
  job_type      public.background_job_type NOT NULL,
  status        public.background_job_status NOT NULL DEFAULT 'queued',

  payload       jsonb NOT NULL DEFAULT '{}',
  result        jsonb,
  error_code    text,
  error_message text,

  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,

  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz,
  failed_at     timestamptz,
  canceled_at   timestamptz
);

-- Indexes
CREATE INDEX idx_background_jobs_status ON public.background_jobs(status);
CREATE INDEX idx_background_jobs_workspace ON public.background_jobs(workspace_id);
CREATE INDEX idx_background_jobs_created_by ON public.background_jobs(created_by);
CREATE INDEX idx_background_jobs_job_type_status ON public.background_jobs(job_type, status);

-- updated_at trigger
ALTER TABLE public.background_jobs ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER trg_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: users see their own jobs
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY background_jobs_user_policy
  ON public.background_jobs FOR ALL
  USING (auth.uid() = created_by);

-- Service role bypass for worker process
CREATE POLICY background_jobs_service_role
  ON public.background_jobs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Enable pgmq extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create pgmq queue (idempotent — pgmq.create skips if queue already exists)
SELECT pgmq.create('image_generation_jobs');
