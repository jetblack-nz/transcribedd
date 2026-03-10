# System Architecture (Supabase MVP)

## Overview
Transcribedd uses a lean Supabase-first architecture for MVP:
- React frontend on Vercel/Netlify
- Supabase for database, auth, realtime, storage, and edge functions
- Swift macOS worker for local Whisper transcription

Security baseline:
- Private transcript storage (no public URLs)
- Signed URLs for downloads (5-15 minute TTL)
- Worker token hash stored at rest (raw token shown once)
- Atomic DB claim function to prevent duplicate processing
- Podcast Index secrets kept server-side in Supabase Edge Function

## High-Level Flow
```text
User -> Web App -> Create job in Supabase
                 -> Realtime event to worker
Worker -> Atomic claim -> Download audio -> Whisper -> Upload transcript
       -> Update job completed -> Realtime update to web app
User -> Request signed URL -> Download transcript
```

## Components

### Web App (React + TypeScript)
- Supabase Auth for user sessions
- Supabase Realtime subscription for job status
- Supabase PostgREST for CRUD
- Supabase Storage access via signed URLs
- Podcast search through an Edge Function proxy

### Supabase
- PostgreSQL tables: `jobs`, `profiles`
- Row Level Security policies on all user data
- Realtime enabled for `jobs` table
- Storage buckets:
  - `audio-files` (private, 24h retention)
  - `transcripts` (private)
- Edge Functions:
  - `podcast-search` (server-side Podcast Index signing)
  - `create-worker-token` (issues one-time raw token, stores hash)
  - `get-transcript-url` (signed download URL)

### macOS Worker (Swift + SwiftUI)
- Subscribes to new pending jobs via Realtime
- Calls RPC to atomically claim one pending job
- Downloads episode audio
- Runs `openai-whisper` locally (default model `small`)
- Uploads transcript artifacts
- Marks job complete/failure
- Stores worker token in macOS Keychain

## Data Model (MVP)

### jobs
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  podcast_title TEXT NOT NULL,
  episode_title TEXT NOT NULL,
  episode_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  transcript_path TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
```

### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  worker_token_hash TEXT,
  worker_token_created_at TIMESTAMPTZ,
  worker_token_last_used_at TIMESTAMPTZ,
  worker_token_revoked_at TIMESTAMPTZ,
  subscription TEXT NOT NULL DEFAULT 'free',
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Critical Security Patterns

### 1) Atomic job claim
Use an RPC/SQL function instead of naive `UPDATE` from realtime callbacks.

```sql
CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT)
RETURNS jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job jobs;
BEGIN
  UPDATE jobs j
  SET status = 'processing',
      worker_id = p_worker_id,
      started_at = NOW()
  WHERE j.id = (
    SELECT id FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;
```

### 2) Private transcript access
- Keep `transcripts` bucket private.
- Store `transcript_path` in DB, not public URL.
- Issue signed URL per request from trusted backend/edge function.

### 3) Worker credential handling
- Generate random token once.
- Persist only hash in `profiles.worker_token_hash`.
- Validate by hashing provided token and comparing.
- Support rotate/revoke from web UI.

### 4) Podcast API secret isolation
- Never use `VITE_*` for Podcast Index secret.
- Web app calls an Edge Function.
- Edge Function signs and forwards request to Podcast Index.

## RLS and Storage Policies (MVP)
- `jobs`: users can `select/insert/update` their own rows.
- `profiles`: users can `select/update` only their own row.
- `storage.objects` in `transcripts`: owner-folder scoped access.
- Worker writes should be scoped to job owner path.

## Operational Guardrails
- Rate limit job creation (for example, 5/hour/user for free tier)
- Max episode duration: 90 minutes (free tier)
- Max source file size: 200MB
- Audio retention: 24 hours
- Transcript retention: 180 days (default)
- Log claim failures and retry with bounded backoff

## Migration Path
When free-tier limits are exceeded:
1. Upgrade Supabase plan first.
2. If needed, migrate to Azure using preserved Azure docs (`QUICKSTART_AZURE.md`).
3. Keep schema compatibility to reduce migration risk.
