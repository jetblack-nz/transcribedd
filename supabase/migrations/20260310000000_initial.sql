-- Transcribedd initial schema
-- Run this in Supabase Dashboard → SQL Editor, or via: supabase db push

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  podcast_title    TEXT NOT NULL,
  episode_title    TEXT NOT NULL,
  episode_url      TEXT NOT NULL,
  audio_file_url   TEXT,
  status           TEXT NOT NULL
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
    DEFAULT 'pending',
  transcript_path  TEXT,
  worker_id        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  error_message    TEXT
);

CREATE TABLE profiles (
  id                         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                      TEXT UNIQUE NOT NULL,
  worker_token_hash          TEXT,
  worker_token_created_at    TIMESTAMPTZ,
  worker_token_last_used_at  TIMESTAMPTZ,
  worker_token_revoked_at    TIMESTAMPTZ,
  subscription               TEXT NOT NULL DEFAULT 'free',
  jobs_completed             INTEGER NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Atomic job claim (used by macOS worker)
-- ---------------------------------------------------------------------------
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

  RETURN NEXT v_job;
END;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- jobs: users can only see/create/update their own rows
CREATE POLICY "Users can view own jobs"
  ON jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs"
  ON jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jobs"
  ON jobs FOR UPDATE USING (auth.uid() = user_id);

-- profiles: users can only see/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

-- ---------------------------------------------------------------------------
-- Storage bucket policies
-- (Run after creating 'transcripts' and 'audio-files' buckets in the dashboard)
-- ---------------------------------------------------------------------------

-- Transcripts: users can upload to their own folder only
CREATE POLICY "Users can upload own transcripts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'transcripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Transcripts: users can read from their own folder only
CREATE POLICY "Users can read own transcripts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'transcripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Audio files: authenticated workers can upload (worker writes to user-scoped path)
CREATE POLICY "Authenticated users can upload audio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio-files');

-- Audio files: owner can read their own audio
CREATE POLICY "Users can read own audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
