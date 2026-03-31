-- Atomic increment of background_jobs.attempt_count.
-- Returns the new attempt_count and max_attempts in a single round-trip,
-- preventing race conditions when multiple workers pick up the same message.
CREATE OR REPLACE FUNCTION public.increment_job_attempt(p_job_id uuid)
RETURNS TABLE(attempt_count integer, max_attempts integer)
LANGUAGE sql
AS $$
  UPDATE background_jobs
  SET attempt_count = background_jobs.attempt_count + 1,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING background_jobs.attempt_count, background_jobs.max_attempts;
$$;
