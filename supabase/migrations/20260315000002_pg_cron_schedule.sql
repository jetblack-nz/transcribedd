-- Enable extensions required for pg_cron HTTP scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Schedule trigger_runpod_for_stale_jobs every minute
SELECT cron.schedule(
  'runpod-trigger-stale-jobs',
  '* * * * *',
  'SELECT trigger_runpod_for_stale_jobs();'
);
