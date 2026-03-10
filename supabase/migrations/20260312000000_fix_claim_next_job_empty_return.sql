-- Fix: claim_next_job previously returned a null row (all fields NULL) when no
-- pending jobs existed.  Swift's Codable decoder cannot decode UUID from NULL,
-- so `claimNextJob()` threw a DecodingError instead of returning nil.
-- Now the function only returns a row when an actual job was claimed.

CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Only return a row when we actually claimed a job.
  -- Previously RETURN NEXT v_job was called unconditionally, returning a
  -- fully-null row when no pending job existed, causing Swift's JSON decoder
  -- to throw when trying to parse a UUID from null.
  IF v_job.id IS NOT NULL THEN
    RETURN NEXT v_job;
  END IF;
END;
$$;
