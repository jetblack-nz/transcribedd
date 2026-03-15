# Architecture — Transcribedd

## System Overview

Transcribedd is a podcast transcription service with four main components communicating through Supabase as the shared backbone:

```
User ──► Web App ──────────────► Supabase (jobs row inserted)
                                        │
                          Realtime      ▼
                   ┌─────────────── jobs table
                   │                   │
                   ▼                   ▼
          macOS Worker          Linux Worker (Docker)
          (Swift + whisper-cli) (Python + faster-whisper)
                   │
                   └──► download audio
                        ──► transcribe locally
                        ──► upload to Storage
                        ──► mark job completed
                                        │
                                        ▼
User ──► get-transcript-url ──► signed Storage URL ──► download
         (Edge Function)
```

## Components

### 1. Web App (`web-app/frontend/`)
React 19 + TypeScript SPA, deployed to Azure Static Web Apps.

| Concern | Approach |
|---|---|
| Auth | Supabase Auth — email/password + Google OAuth (PKCE flow) |
| Server state | Supabase JS client (`useJobs`, `useAuth` hooks) |
| Realtime updates | `supabase.channel()` subscription on `jobs` table |
| Routing | React Router v7 with `<ProtectedRoute>` wrapper |
| Styling | Tailwind CSS v4 |
| Build | Vite 7, TypeScript strict |

Key pages: `AuthPage`, `AuthCallbackPage`, `DashboardPage`, `SearchPage`

### 2. macOS Worker (`mac-app/`)
Swift + SwiftUI menu-bar app. Targets macOS 14+, strict concurrency.

- Subscribes to Supabase Realtime for new `pending` jobs
- Claims jobs atomically via `claim_next_job()` RPC
- Downloads audio, converts to WAV via `ffmpeg`
- Runs `whisper-cli` as a subprocess (default model: `small`)
- Uploads transcript to `transcripts` Storage bucket
- Marks job `completed` or `failed` via `complete_job()` / `fail_job()` RPCs
- Worker secret stored in macOS Keychain via `KeychainHelper`

### 3. Linux Worker (`linux-worker/`)
Python asyncio worker, containerised with Docker.

- Same job lifecycle as macOS worker
- Uses `faster-whisper` (CTranslate2-based, faster than openai-whisper)
- Structured JSON logging via `structlog`
- Realtime subscription with polling fallback
- Resets own stuck jobs on startup
- Progress callbacks during transcription

### 4. Supabase Backend (`supabase/`)
PostgreSQL + Auth + Realtime + Storage + Deno Edge Functions.

**Edge Functions:**
| Function | Purpose |
|---|---|
| `podcast-search` | Proxies Podcast Index API (keeps API secret server-side) |
| `get-transcript-url` | Issues short-lived signed Storage URLs (≤15 min TTL) |
| `process-transcript` | AI post-processing via Groq (formats transcript as docx) |

**Storage buckets:**
| Bucket | Access | Retention |
|---|---|---|
| `audio-files` | Private | 24h (temporary) |
| `transcripts` | Private, signed URLs only | Indefinite |

## Data Flow

### Job Creation
1. User searches for podcast via `SearchPage` → calls `podcast-search` Edge Function
2. User selects episode → `useJobs.createJob()` inserts row into `jobs` table
3. Supabase Realtime fires INSERT event to connected workers

### Job Processing
1. Worker receives Realtime notification (or polls on timeout)
2. Worker calls `claim_next_job(worker_id)` RPC — atomic `FOR UPDATE SKIP LOCKED`
3. Worker downloads `episode_url`, converts to WAV if needed
4. Worker transcribes locally (no audio leaves the machine)
5. Worker uploads transcript text to `transcripts/{user_id}/{job_id}.txt`
6. Worker calls `complete_job(job_id, transcript_path, worker_id)` RPC
7. Supabase Realtime fires UPDATE event → web app refreshes job status

### Transcript Download (text)
1. User clicks "Download (text)" → web app fetches transcript via `get-transcript-url` Edge Function
2. Edge Function generates signed URL (15 min TTL) and returns it
3. Browser downloads directly from Storage

### Transcript Download (docx)
1. User clicks "Download (docx)" → web app calls `process-transcript` Edge Function with prompt
2. Edge Function calls Groq API to format transcript
3. Web app generates `.docx` locally using the `docx` npm library

## Key Architectural Boundaries

| Boundary | Rule |
|---|---|
| Frontend ↔ Supabase | Only the single client from `lib/supabase.ts` — never create a second client |
| Frontend ↔ Podcast Index | Always proxied through `podcast-search` Edge Function — never call directly |
| Storage access | Always via signed URL from `get-transcript-url` — never public bucket URLs |
| Job claiming | Always via `claim_next_job()` RPC — never a raw `UPDATE` from client code |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` and Podcast Index keys live only in Edge Functions / Keychain |
| Auth | All user tables protected by RLS — never disable it |

## External Services / Integrations

| Service | Used For | Secret Location |
|---|---|---|
| Supabase | DB, Auth, Realtime, Storage, Edge Functions | `.env.local` (anon key only) |
| Podcast Index API | Podcast search | Supabase Edge Function secrets |
| Groq API | AI transcript post-processing | Supabase Edge Function secrets |
| Azure Static Web Apps | Frontend hosting + CI/CD | GitHub Actions secrets |
| Apple Keychain | macOS worker token storage | macOS only |

## What Is Intentionally Out of Scope

- **No custom backend server** — Supabase handles all privileged operations
- **No job queue** — the `jobs` table with `FOR UPDATE SKIP LOCKED` is the queue
- **No Redis / caching layer** — premature for current scale
- **No public transcript URLs** — always signed, always TTL-limited
- **No client-side Podcast Index calls** — API secret must stay server-side
