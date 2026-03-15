-- -------------------------------------------------------------------------
-- Fix trigger_runpod_for_stale_jobs to use Vault for auth secret
-- instead of app.settings (which would store the service role key in
-- plain DB config). The CRON_SECRET is a dedicated token stored encrypted
-- in Supabase Vault — the service role key never touches the database.
--
-- One-time setup (run in Supabase SQL editor):
--
--   SELECT vault.create_secret(
--     '<value>',       -- same value as: supabase secrets set CRON_SECRET=<value>
--     'cron_secret',
--     'pg_cron auth token for trigger-worker edge function'
--   );
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

  -- Read CRON_SECRET from Vault (encrypted at rest)
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
    LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_runpod_for_stale_jobs: cron_secret not found in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://dsxfwfeuvkccepfangqd.supabase.co/functions/v1/trigger-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$$;
