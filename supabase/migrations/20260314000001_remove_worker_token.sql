-- Remove unused worker token fields from profiles.
-- The token was generated and hashed but never verified anywhere.
-- Authentication for the server worker uses SUPABASE_SERVICE_ROLE_KEY instead.
ALTER TABLE profiles
  DROP COLUMN IF EXISTS worker_token_hash,
  DROP COLUMN IF EXISTS worker_token_created_at,
  DROP COLUMN IF EXISTS worker_token_last_used_at,
  DROP COLUMN IF EXISTS worker_token_revoked_at;
