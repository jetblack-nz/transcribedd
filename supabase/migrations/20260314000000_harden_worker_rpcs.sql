-- Harden worker RPC functions:
--   1. REVOKE EXECUTE from PUBLIC/anon (was open to all callers by default)
--   2. GRANT EXECUTE to authenticated only
--   3. Add SET search_path = public to all three functions
--   4. Add p_worker_id ownership check to complete_job and fail_job

-- ---------------------------------------------------------------------------
-- claim_next_job: add SET search_path only (no signature change)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs j
  SET
    status     = 'processing',
    worker_id  = p_worker_id,
    started_at = NOW()
  WHERE j.id = (
    SELECT id FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_job;

  IF v_job.id IS NOT NULL THEN
    RETURN NEXT v_job;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- complete_job: add p_worker_id ownership check + SET search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_job(
  p_job_id         UUID,
  p_transcript_path TEXT,
  p_worker_id      TEXT
)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs
  SET
    status          = 'completed',
    transcript_path = p_transcript_path,
    completed_at    = NOW()
  WHERE id        = p_job_id
    AND worker_id = p_worker_id
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job % not found or not owned by worker %', p_job_id, p_worker_id;
  END IF;

  RETURN NEXT v_job;
END;
$$;

-- ---------------------------------------------------------------------------
-- fail_job: add p_worker_id ownership check + SET search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fail_job(
  p_job_id       UUID,
  p_error_message TEXT,
  p_worker_id    TEXT
)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs
  SET
    status        = 'failed',
    error_message = p_error_message,
    completed_at  = NOW()
  WHERE id        = p_job_id
    AND worker_id = p_worker_id
  RETURNING * INTO v_job;

  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job % not found or not owned by worker %', p_job_id, p_worker_id;
  END IF;

  RETURN NEXT v_job;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lock down EXECUTE: revoke from PUBLIC, grant to authenticated only
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION claim_next_job(TEXT)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION complete_job(UUID, TEXT, TEXT)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fail_job(UUID, TEXT, TEXT)       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION claim_next_job(TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION complete_job(UUID, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION fail_job(UUID, TEXT, TEXT)       TO authenticated;
