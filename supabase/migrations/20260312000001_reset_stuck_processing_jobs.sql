-- Reset jobs stuck in 'processing' state back to 'pending' so the worker can retry.
-- Safe to run: if the worker is actively processing a job it will simply reclaim it.
UPDATE jobs
SET status = 'pending', worker_id = NULL, started_at = NULL
WHERE status = 'processing';
