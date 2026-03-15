# CLAUDE.md — Transcribedd

## Session Protocol

**At the start of every session:** read `docs/PROGRESS.md` to understand current state and blockers.

**Before ending every session:** update `docs/PROGRESS.md` to reflect what was completed, what is now in progress, and any new blockers discovered.

## Autonomous Work Protocol

Full bash access is granted. Work autonomously — read files, run tests, run the linter, explore the codebase, fix failures, and iterate without asking for permission.

When given a task, follow this loop without interruption:

1. Read `docs/PROGRESS.md` to understand current state
2. Write or modify code
3. Run tests — if failing, fix and repeat from step 2
4. Run linter — fix any errors
5. Confirm the task is complete end-to-end
6. Update `docs/PROGRESS.md`
7. Propose a commit message — **do not commit unless explicitly told to**

**Hard stops — always pause and ask before:**
- Anything touching production environment variables
- Any push to `main` or release branches
- Any migration or schema change
- Any command containing `drop`, `delete`, `destroy`, or `prod`

## Reference Docs

@docs/ARCHITECTURE.md
@docs/CONVENTIONS.md
@docs/DECISIONS.md
@docs/PROGRESS.md
@docs/plan/SECURITY_FIXES.md

## Never Do This

- **Never commit** — propose a commit message and wait for the user to say so
- **Never run database migrations** without showing the full SQL first and getting explicit approval
- **Never delete files** — archive or comment out instead; check before any `rm`
- **Never install packages** without flagging the name, purpose, and bundle-size impact first
- **Never modify `.env` files** — show the user what line to add and let them do it
- **Never put secrets in frontend code** — `SUPABASE_SERVICE_ROLE_KEY`, Podcast Index keys, and Groq keys must stay in Edge Functions or macOS Keychain
- **Never generate public Storage URLs** for transcripts — always use `get-transcript-url` Edge Function
- **Never do a raw `UPDATE` on `jobs`** for job claiming — always use `claim_next_job()` RPC
- **Never disable RLS** on user-facing tables

---

## Project Overview

Podcast transcription service: users discover podcasts via a React web app, submit transcription jobs, and a local worker (macOS or Linux) picks them up via Supabase Realtime, transcribes with Whisper, and returns results. See `docs/ARCHITECTURE.md` for the full system diagram.

**Components:**
1. `web-app/frontend/` — React 19 + TypeScript SPA (Vite, Tailwind CSS v4, React Router v7, Supabase JS)
2. `mac-app/` — Swift + SwiftUI menu-bar app running `whisper-cli` locally
3. `linux-worker/` — Python asyncio worker using `faster-whisper`, containerised with Docker
4. `supabase/` — PostgreSQL, Auth, Realtime, Storage, Deno Edge Functions

---

## Build & Dev Commands

### Web App
```bash
cd web-app/frontend
npm run dev           # start dev server (http://localhost:5173)
npm run build         # TypeScript check + Vite build
npm run lint          # ESLint
npm run test          # Vitest unit tests (118 tests)
npm run test:e2e      # Playwright E2E tests
npm run test:coverage
```

### macOS Worker
```bash
cd mac-app
./build.sh            # debug build
./build.sh release    # release build
```

### Linux Worker
```bash
cd linux-worker
docker compose up     # run worker in Docker
python -m pytest      # run unit tests
```

### Supabase
```bash
supabase start                    # local Supabase stack (requires Docker)
supabase db push                  # apply migrations to remote project
supabase functions serve          # run Edge Functions locally
supabase functions deploy <name>  # deploy a specific Edge Function
```

---

## Source Layout

### Web App (`web-app/frontend/src/`)
```
components/     # JobCard, Layout, ProtectedRoute  (each has a .test.tsx)
pages/          # AuthPage, AuthCallbackPage, DashboardPage, SearchPage
hooks/          # useAuth, useJobs  (patterns for new hooks)
lib/            # supabase.ts — the single Supabase client
types/          # index.ts — shared TypeScript types
test/           # setup.ts, mocks/supabase.ts, mocks/data.ts, utils/test-utils.tsx
e2e/            # Playwright specs: auth, dashboard, search
```

### macOS Worker (`mac-app/TranscribeddWorker/`)
```
Models/         # Job.swift
Services/       # SupabaseService, TranscriptionService, DownloadManager, NotificationService
Settings/       # AppSettings.swift
Utils/          # KeychainHelper.swift
Views/          # MenuBarView, PreferencesView
```

### Linux Worker (`linux-worker/worker/`)
```
main.py         # asyncio entrypoint, job loop
config.py       # Config dataclass (loaded from env)
supabase_ops.py # claim_next_job, complete_job, fail_job, upload_transcript
downloader.py   # audio file download
transcriber.py  # faster-whisper wrapper
test_*.py       # co-located pytest tests
```

### Supabase
```
migrations/     # YYYYMMDDHHMMSS_description.sql
functions/      # get-transcript-url, podcast-search, process-transcript
```

---

## Data Model (current)

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
| `processing_prompt` | TEXT | user's AI formatting prompt for docx export |
| `subscription` | TEXT | `free` (default) |
| `jobs_completed` | INTEGER | |

---

## Environment Variables

### Web App (`.env.local`)
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
TEST_USER_EMAIL=<e2e test user>
TEST_USER_PASSWORD=<e2e test password>
```

### Linux Worker (`.env`)
```
SUPABASE_URL=
SUPABASE_SECRET_KEY=
WORKER_ID=
WHISPER_MODEL=small
```

### Supabase Edge Functions (Supabase Secrets)
```
PODCAST_INDEX_API_KEY
PODCAST_INDEX_API_SECRET
GROQ_API_KEY
SUPABASE_SERVICE_ROLE_KEY   # only for trusted Edge Functions
```

---

## Deployment

- **Frontend**: Azure Static Web Apps — auto-deploys on push to `main` via `.github/workflows/azure-static-web-apps-wonderful-dune-0b17e6900.yml`
- **Backend**: Supabase managed (free tier), project ref `dsxfwfeuvkccepfangqd`, region: Northeast Asia (Seoul)
- **macOS worker**: Distributed as a signed `.app` bundle built via `build.sh`
- **Linux worker**: Docker image — deployment target TBD

> **IMPORTANT — deploy ALL parts of a change, not just the frontend.**
> Pushing to `main` only deploys the frontend automatically. Edge function and DB changes require manual steps:
> - Edge functions: **always deploy with `--no-verify-jwt`** — this project's Supabase instance uses a separate Auth signing key for user JWTs that the gateway doesn't recognise; functions handle JWT validation internally via `userClient.auth.getUser()`. Command: `mv .env.local .env.local.bak && supabase functions deploy <name> --no-verify-jwt; mv .env.local.bak .env.local`
> - DB migrations: `supabase db push` (same `.env.local` workaround)
> - If you changed an edge function, always redeploy it — committed ≠ deployed.
