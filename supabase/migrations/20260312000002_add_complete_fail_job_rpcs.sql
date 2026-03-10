-- Replace direct REST UPDATE calls for job completion/failure with SECURITY DEFINER
-- RPCs.  The direct .update().eq().execute() pattern in supabase-swift silently
-- updates 0 rows when RLS blocks the write; SECURITY DEFINER bypasses RLS entirely,
-- matching the approach already used by claim_next_job.

CREATE OR REPLACE FUNCTION complete_job(p_job_id UUID, p_transcript_path TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs
  SET
    status          = 'completed',
    transcript_path = p_transcript_path,
    completed_at    = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  RETURN NEXT v_job;
END;
$$;

CREATE OR REPLACE FUNCTION fail_job(p_job_id UUID, p_error_message TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs
  SET
    status        = 'failed',
    error_message = p_error_message,
    completed_at  = NOW()
  WHERE id = p_job_id
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job % not found', p_job_id;
  END IF;

  RETURN NEXT v_job;
END;
$$;
