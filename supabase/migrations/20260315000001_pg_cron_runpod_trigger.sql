-- -------------------------------------------------------------------------
-- claim_stale_job
--
-- Like claim_next_job but only claims jobs that have been in 'pending'
-- state for at least p_stale_seconds (default: 90).
-- Used by trigger-worker so RunPod only picks up jobs the macOS worker
-- hasn't claimed within the priority window.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_stale_job(
  p_worker_id     TEXT,
  p_stale_seconds INT DEFAULT 90
)
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
    WHERE status   = 'pending'
      AND created_at < NOW() - make_interval(secs => p_stale_seconds)
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

-- Only service_role (used by edge functions) may call this
REVOKE EXECUTE ON FUNCTION claim_stale_job(TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION claim_stale_job(TEXT, INT) TO service_role;

-- -------------------------------------------------------------------------
-- trigger_runpod_for_stale_jobs
--
-- Called every minute by pg_cron. Only fires the HTTP request when there
-- are actually stale jobs, to avoid unnecessary edge function cold-starts.
--
-- Auth: reads CRON_SECRET from Supabase Vault (encrypted at rest).
--       The service role key is NEVER stored in the database.
--
-- Prerequisites — run once in the Supabase SQL editor after deploying:
--
--   SELECT vault.create_secret(
--     '<value of CRON_SECRET supabase secret>',
--     'cron_secret',
--     'pg_cron auth token for trigger-worker edge function'
--   );
--
-- The CRON_SECRET value must match the secret set via:
--   supabase secrets set CRON_SECRET=<value>
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_runpod_for_stale_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_stale_count int;
  v_url         text;
  v_secret      text;
BEGIN
  -- Only fire if there are actually stale jobs — avoids cold-starting the
  -- edge function on every tick when the queue is empty.
  SELECT count(*) INTO v_stale_count
    FROM public.jobs
    WHERE status     = 'pending'
      AND created_at < NOW() - INTERVAL '90 seconds';

  IF v_stale_count = 0 THEN
    RETURN;
  END IF;

  -- Read CRON_SECRET from Vault (encrypted at rest — not the service role key)
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_runpod_for_stale_jobs: cron_secret not found in vault';
    RETURN;
  END IF;

  v_url := 'https://dsxfwfeuvkccepfangqd.supabase.co/functions/v1/trigger-worker';

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$$;

-- pg_cron schedule is created in 20260315000002_pg_cron_schedule.sql
-- (requires pg_cron and pg_net extensions to be enabled first)
