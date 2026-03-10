# Copilot Instructions for Transcribedd

## Project Overview

Transcribedd is a podcast transcription service with three components:

1. **Web App** (`web-app/frontend/`) — React + TypeScript SPA (Vite, Tailwind CSS v4, React Query, React Router v7, Supabase JS)
2. **macOS Worker** (`mac-app/`) — Swift + SwiftUI menu-bar app that runs `whisper-cli` locally and communicates with Supabase
3. **Supabase Backend** (`supabase/`) — PostgreSQL, Auth, Realtime, Storage, and Deno Edge Functions

## Architecture

```
User → Web App → Supabase (job row)
                       ↓ Realtime
              macOS Worker → claim_next_job() RPC
                           → download audio
                           → run whisper-cli locally
                           → upload transcript to Storage
                           → mark job completed
User → get-transcript-url Edge Function → signed Storage URL
```

## Key Conventions

### General
- Prefer editing existing files over creating new ones
- Keep logic minimal — no speculative abstractions or future-proofing
- Never expose secrets; all sensitive keys live in environment variables or the macOS Keychain

### Web App (React + TypeScript)
- All components in `web-app/frontend/src/components/`, pages in `pages/`, hooks in `hooks/`
- Use `@tanstack/react-query` for server state; avoid local state for async data
- Use the `supabase` client from `web-app/frontend/src/lib/supabase.ts` — never create secondary clients
- Tailwind CSS v4 for styling (no CSS-in-JS)
- Authenticated routes wrapped in `<ProtectedRoute>`
- Types shared in `web-app/frontend/src/types/index.ts`
- Use `useAuth` and `useJobs` hooks as patterns for new feature hooks

### Supabase
- All user data is protected by Row Level Security (RLS) — always add RLS policies when creating new tables
- Use `SECURITY DEFINER` functions for privileged operations (e.g., `claim_next_job`, `handle_new_user`)
- Job claiming must use the atomic `claim_next_job(p_worker_id TEXT)` RPC (`FOR UPDATE SKIP LOCKED`) — never do a naive `UPDATE` from client code
- Signed URLs from the `get-transcript-url` Edge Function — never generate public Storage URLs for transcripts
- Worker tokens: raw token shown once, only the bcrypt hash stored in `profiles.worker_token_hash`
- Edge Functions are in `supabase/functions/<name>/index.ts` (Deno/TypeScript)
- Migrations go in `supabase/migrations/` with timestamp prefix `YYYYMMDDHHMMSS_description.sql`

### macOS Worker (Swift)
- Targets macOS 14+, uses Swift strict concurrency (`-strict-concurrency=complete`)
- Supabase Swift SDK (`supabase-swift` v2) for realtime and storage
- Worker token stored in macOS Keychain via `KeychainHelper`
- Build with `./build.sh [debug|release]` — produces `TranscribeddWorker.app`
- Default Whisper model: `small`; invoked via `whisper-cli` subprocess

## Data Model

### `jobs` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `auth.users` |
| `status` | TEXT | `pending` / `processing` / `completed` / `failed` |
| `podcast_title` | TEXT | |
| `episode_title` | TEXT | |
| `episode_url` | TEXT | |
| `audio_file_url` | TEXT | temporary storage path |
| `transcript_path` | TEXT | Storage path for transcript |
| `worker_id` | TEXT | identifies which worker claimed the job |
| `started_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |
| `error_message` | TEXT | populated on failure |

### `profiles` table
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, FK → `auth.users` |
| `email` | TEXT | |
| `worker_token_hash` | TEXT | bcrypt hash only |
| `subscription` | TEXT | `free` (default) |
| `jobs_completed` | INTEGER | |

## Security Rules (Non-Negotiable)
- Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend code or any client-side bundle
- Always use RLS; never disable it on user-facing tables
- All transcript access must go through signed URLs (TTL ≤ 15 min)
- Worker authentication uses hashed tokens, never plaintext
- Podcast Index API keys must stay server-side (Edge Function only)

## Build & Dev Commands

### Web App
```bash
cd web-app/frontend
npm run dev          # start dev server
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
```

### macOS Worker
```bash
cd mac-app
./build.sh           # debug build
./build.sh release   # release build
```

### Supabase
```bash
supabase start                    # local Supabase stack
supabase db push                  # apply migrations
supabase functions serve          # run Edge Functions locally
supabase functions deploy <name>  # deploy a specific Edge Function
```

## Environment Variables

### Web App (`.env.local`)
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Supabase Edge Functions (Supabase Secrets)
```
PODCAST_INDEX_API_KEY
PODCAST_INDEX_API_SECRET
SUPABASE_SERVICE_ROLE_KEY  # only for trusted Edge Functions
```
