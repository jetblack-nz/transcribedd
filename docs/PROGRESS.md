# Progress — Transcribedd

_Last updated: 2026-03-15 (session 6)_

---

## What Is Complete

### Web App
- ✅ Authentication: email/password sign-in + Google OAuth (PKCE flow)
- ✅ Auth callback page with error surfacing (`/auth/callback`)
- ✅ Protected routes with loading state
- ✅ Dashboard: job list with real-time status updates via Supabase Realtime
- ✅ Job creation via SearchPage (podcast search → episode select → create job)
- ✅ Download (text): fetches signed URL from `get-transcript-url` Edge Function
- ✅ Download (docx): AI post-processing via Groq + client-side Word doc generation
- ✅ Processing prompt: user-configurable AI formatting prompt saved to `profiles`
- ✅ Timing notices on transcript/docx downloads
- ✅ Unit tests: 125 passing across 9 test files
- ✅ E2E tests: 42/42 passing (chromium, firefox, webkit) — programmatic auth via global setup, no UI form login
- ✅ Deployed to Azure Static Web Apps (auto-deploys on push to `main`)
- ✅ Worker token UI removed from dashboard
- ✅ `Profile` type cleaned up (stale worker token fields removed)
- ✅ Stale E2E test (`should display worker token section`) removed

### macOS Worker
- ✅ Menu-bar app with preferences window
- ✅ Supabase Realtime subscription for new pending jobs
- ✅ Atomic job claiming via `claim_next_job()` RPC
- ✅ Audio download + ffmpeg WAV conversion
- ✅ `whisper-cli` transcription subprocess
- ✅ Transcript upload to Supabase Storage
- ✅ Job completion/failure RPCs — now pass `workerId` for ownership check
- ✅ Keychain storage for worker auth token

### Linux Worker
- ✅ Python asyncio worker with `faster-whisper` (CTranslate2, GPU-accelerated)
- ✅ Dockerfile on `nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04` + ffmpeg
- ✅ `docker-compose.yml` with NVIDIA GPU reservation + Whisper model volume
- ✅ `worker/config.py` — frozen dataclass, `load()` validates required env vars
- ✅ `worker/supabase_ops.py` — `init_client`, stuck-job reset, all RPCs, storage upload
- ✅ `worker/downloader.py` — URL sanitisation, streaming download with browser UA
- ✅ `worker/transcriber.py` — ffmpeg WAV conversion, ThreadPoolExecutor transcription, progress logging
- ✅ `worker/main.py` — `process_job()` per-stage timeouts, Realtime wakeup + 30s poll fallback, SIGTERM handling
- ✅ Structured JSON logging via `structlog` with URL sanitisation in logs
- ✅ Stuck job recovery on startup
- ✅ `worker/runpod_ops.py` — `stop_pod()` for always-on mode self-termination
- ✅ 60 pytest tests passing across 5 test files (`test_config`, `test_downloader`, `test_supabase_ops`, `test_transcriber`, `test_main`)
- ✅ Architecture documented in `docs/plan/LINUX_WORKER.md`

### RunPod Serverless Integration
- ✅ `trigger-worker` edge function redesigned — claims stale jobs (>90s) and submits to RunPod Serverless endpoint
- ✅ `runpod-callback` edge function — receives RunPod webhook, uploads transcript, calls `complete_job`
- ✅ `20260315000001_pg_cron_runpod_trigger.sql` — `claim_stale_job` RPC + pg_cron schedule (every 60s)
- ✅ Architecture verified: macOS uses **Metal GPU** + 30s poll; RunPod is overflow/fallback
- ✅ `LINUX_WORKER.md` updated with final RunPod Serverless architecture

### Supabase Backend
- ✅ `jobs` and `profiles` tables with RLS
- ✅ `claim_next_job`, `complete_job`, `fail_job` RPCs
- ✅ `podcast-search`, `get-transcript-url`, `process-transcript` Edge Functions
- ✅ `audio-files` and `transcripts` Storage buckets
- ✅ Realtime enabled on `jobs` table
- ✅ `processing_prompt` column on `profiles`
- ✅ Worker RPC hardening (`20260314000000`): `REVOKE FROM PUBLIC`, `GRANT TO authenticated`, `SET search_path = public`, `worker_id` ownership check on `complete_job`/`fail_job` — **applied and integration-tested against live DB**
- ✅ Worker token columns removed (`20260314000001`): `worker_token_hash` and related columns dropped from `profiles` — **applied**
- ✅ `create-worker-token` Edge Function deleted
- ✅ SSRF protection (`20260315000000`): `episode_url HTTPS CHECK` constraint + frontend validation rejecting private/loopback ranges
- ✅ `claim_stale_job` RPC + `trigger_runpod_for_stale_jobs` function (`20260315000001`) — **applied to live DB**
- ✅ pg_cron + pg_net extensions + cron schedule (`20260315000002`) — **applied to live DB**

### Project Infrastructure
- ✅ `CLAUDE.md` merged to main (AI assistant conventions, build commands, security rules)

---

## What Is In Progress / Partially Done

### Security Fixes (from pentest, 2026-03-10)
See `docs/plan/SECURITY_FIXES.md` for full details. Outstanding items:

| ID | Issue | Status |
|---|---|---|
| C-1 | Sign-up not enforced as invite-only | ❌ Not started |
| H-1 | Any authenticated user can call worker RPCs | ✅ Fixed in `20260314000000` migration |
| H-2 | SSRF via `episode_url` | ✅ Fixed — frontend validation + DB constraint `20260315000000` |
| M-1 | Missing HTTP security headers | ❌ Not started |
| M-2 | `complete_job`/`fail_job` missing `SET search_path` | ✅ Fixed in `20260314000000` migration |
| M-3 | No job creation rate limit | ❌ Not started |
| M-4 | `get-transcript-url` leaks raw error | ❌ Not started |
| L-1 | Supabase anon key in `UserDefaults` (macOS) | ❌ Not started |
| L-2 | Realtime subscription receives all users' jobs (macOS) | ❌ Not started |

---

## Known Issues / Blockers

1. **macOS worker needs redeployment** — Swift code updated to pass `workerId` to `complete_job`/`fail_job`, but the built app on the Mac must be rebuilt and restarted to use the new RPC signatures.

2. **Sign-up is open** — Despite "Access by invitation only." copy in the UI, anyone with the project URL can create an account via the API. C-1 from SECURITY_FIXES.md.

---

## What Is Not Yet Started

- HTTP security headers on Azure Static Web Apps (`staticwebapp.config.json`)
- Job creation rate limiting (DB trigger)
- SSRF protection on `episode_url`
- `get-transcript-url` error message hardening
- Supabase anon key moved to Keychain on macOS
- Realtime filter by `user_id` on macOS worker
- Full-text transcript search
- Transcript viewer in web app (currently download-only)
- Multiple format downloads (SRT, VTT) — only plain text and docx today
- Email notifications on job completion
- Usage statistics / admin dashboard
- Speaker diarization
- macOS app code signing and notarization for distribution
- **RunPod Serverless endpoint setup** — create endpoint in RunPod console, set `RUNPOD_ENDPOINT_ID` secret
- **pg_cron DB params** — run in Supabase SQL editor: `ALTER DATABASE postgres SET app.settings.supabase_url = '...'; ALTER DATABASE postgres SET app.settings.service_role_key = '...';`
- macOS worker rebuild + restart after RPC signature change
