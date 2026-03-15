# Linux GPU Worker — Architecture & Implementation Plan

## Overview

A headless Python daemon that runs in a Docker container with NVIDIA GPU access. It claims transcription jobs from Supabase, downloads audio, transcribes with Whisper (`large-v3`), and uploads results. It is a **drop-in replacement for the macOS worker** — no Supabase schema changes, no new RPC functions, no new storage buckets.

### Deployment Target: RunPod Serverless

The worker runs on **RunPod Serverless** using the pre-built [`worker-faster_whisper`](https://console.runpod.io/hub/runpod-workers/worker-faster_whisper) Hub endpoint. There is no persistent pod to manage — the endpoint scales to zero when idle and cold-starts on demand.

**Architecture**: The macOS worker has a 90-second priority window on every new job (it receives Supabase Realtime notifications instantly). If the macOS worker is offline or busy, a pg_cron job fires every 60 seconds, finds jobs pending > 90 seconds, claims them, and submits them to the RunPod Serverless endpoint. RunPod calls back a webhook (`runpod-callback` edge function) with the transcript, which uploads to storage and marks the job complete.

**Why RunPod Serverless, not an on-demand pod**: An initial attempt to run on a shared Debian server (node3.gyr.lan, NVIDIA T600, 4 GB VRAM) failed — Immich ML and Scrypted consumed ~3.8 GB of the 4 GB VRAM. An on-demand pod approach was then planned, but RunPod has no Start/Stop button (only Reset/Terminate) and pod management via API is unreliable for this use case. RunPod Serverless scales to zero automatically and requires no lifecycle management.

**Cost at 10 jobs/day, 30 min avg with `turbo` model**: ~$0.30/day. Zero idle cost.

---

## What Changes vs the Mac App

| Concern | Mac App | Linux Worker / RunPod |
|---|---|---|
| Language | Swift | Python 3.11+ |
| Transcription | `whisper-cli` subprocess (**Metal GPU**, `ggml-base` by default) | `faster-whisper` library (CUDA, `large-v3`) |
| Auth | GitHub OAuth (interactive JWT) | `SUPABASE_SERVICE_ROLE_KEY` (env var) |
| Process management | macOS launchd / user session | RunPod Serverless (scales to zero, no pod management) |
| UI / notifications | SwiftUI menu bar | None (structured log output only) |
| Job discovery | Realtime INSERT → immediate wake; 30s poll fallback | pg_cron triggers after 90s if job still pending |
| Availability | When Mac is on (priority worker) | Overflow / fallback when macOS is offline |

Everything else — job claiming RPC, storage upload path convention, `complete_job`/`fail_job` RPC signatures — is **identical**.

---

## Stack

| Concern | Choice | Reason |
|---|---|---|
| Transcription | `faster-whisper` (CTranslate2) | 4–8× faster than original Whisper on GPU; INT8/FP16 quantization; clean Python progress API |
| Supabase client | `supabase-py` | Direct Python equivalent of `supabase-swift`; Realtime, Storage, RPC all supported |
| Audio download | `httpx` | Async HTTP client; supports browser User-Agent spoofing to avoid CDN blocks |
| Audio conversion | `ffmpeg` (system apt package) | Same tool and same command as mac app: `-ar 16000 -ac 1 -c:a pcm_s16le` |
| Structured logging | `structlog` | JSON log output suitable for log aggregation pipelines |
| Container runtime | Docker + NVIDIA Container Toolkit | CUDA dependencies handled by `nvidia/cuda` base image |
| Job routing | pg_cron + `trigger-worker` Edge Function | After 90s, claims stale job and submits to RunPod Serverless |
| Webhook receiver | `runpod-callback` Edge Function | Receives RunPod result, uploads transcript, calls `complete_job` |

---

## Docker: Custom Image Build

We **build a custom Docker image** using a Dockerfile. We do not run a stock image. The flow is:

```
nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04   ← public NVIDIA base image (CUDA + cuDNN, no Python)
  └── ADD: Python 3.11, pip, ffmpeg (apt)
        └── ADD: requirements.txt (faster-whisper, supabase, httpx, structlog)
              └── ADD: worker/ source code
                    └── ENTRYPOINT: python -m worker.main
```

The base image (`nvidia/cuda`) provides the CUDA runtime and cuDNN libraries pre-installed. We layer Python, system dependencies, Python packages, and our application code on top. The final image is ~3–4 GB (CUDA libraries + Python packages; Whisper model is not baked in).

**Model loading**: The Whisper model is **not baked into the image**. It is downloaded on first run by `faster-whisper` and cached in a Docker volume at `/root/.cache/huggingface/`. This keeps the image portable and the model updatable without a rebuild.

**No `/var/run/docker.sock` mount.** The container does not need Docker-in-Docker access and this mount is prohibited — container compromise with socket access equals host control.

**Image pinning**: The base image is pinned by tag in the Dockerfile. For production, pin by digest (`nvidia/cuda@sha256:...`) and define a CVE patch cadence for base image and Python package updates.

---

## Repository Layout

```
linux-worker/
├── Dockerfile
├── docker-compose.yml      # for local testing only
├── .env.example
├── requirements.txt        # all deps pinned to exact versions
└── worker/
    ├── __init__.py
    ├── main.py             # entry point: event loop, Realtime subscription, poll fallback
    ├── config.py           # env var validation and typed config object
    ├── supabase_ops.py     # claim_next_job, complete_job, fail_job, upload_transcript
    ├── downloader.py       # audio download via httpx; browser UA; temp file management
    └── transcriber.py      # faster-whisper init, ffmpeg pre-convert, transcribe with progress
```

---

## Job Processing Flow

```
startup
  ├── load config from env
  ├── init faster-whisper model (GPU)          ← logs: model, device, compute_type, load_time_ms
  ├── init Supabase client (service role key)
  ├── subscribe to Realtime INSERT on jobs     ← logs: realtime_connected
  └── enter job loop

job loop
  ├── call claim_next_job(worker_id) RPC
  │     ├── no job → sleep 30s (or wake on Realtime INSERT)
  │     └── job claimed → log: job_id, podcast_title, episode_title, status=processing
  │
  ├── download audio                           [timeout: 300s]
  │     ├── httpx GET episode_url (browser UA, follow redirects)
  │     ├── save to /tmp/{uuid}.{ext}
  │     └── log: url_sanitised, content_length_bytes, download_duration_ms
  │
  ├── convert audio (if not WAV)               [timeout: 1800s]
  │     ├── ffmpeg → /tmp/{uuid}.wav (16kHz, mono, pcm_s16le)
  │     └── log: input_format, conversion_duration_ms
  │
  ├── transcribe                               [timeout: 14400s / 4hr]
  │     ├── faster-whisper.transcribe(wav_path, beam_size=5)
  │     ├── stream segments with timestamps
  │     ├── log progress: pct_complete (every ~10%)
  │     └── log: audio_duration_s, transcription_duration_ms, realtime_factor
  │
  ├── upload transcript                        [timeout: 120s]
  │     ├── supabase storage PUT transcripts/{user_id}/{job_id}.txt
  │     └── log: storage_path, upload_duration_ms, size_bytes
  │
  └── complete_job(job_id, transcript_path) RPC
        └── log: job_id, total_duration_ms, status=completed

on timeout at any stage:
  ├── kill subprocess (ffmpeg / whisper) if running
  ├── fail_job(job_id, "stage timed out after Xs") RPC
  └── log: job_id, stage, timeout_s, status=failed

on any other error:
  ├── fail_job(job_id, error_message) RPC
  ├── log: job_id, error, stage (download|convert|transcribe|upload), status=failed
  └── continue loop (30s sleep)
```

### Stuck job recovery

On startup the worker resets any `processing` jobs claimed by its own `worker_id` back to `pending` (handles crash-before-fail_job scenario).

---

## RunPod Serverless Architecture

### End-to-end flow

```
User submits job (web app)
  └── INSERT into jobs table (status = 'pending')
        └── Supabase Realtime notifies macOS worker instantly
              └── macOS worker claims job (claim_next_job), transcribes with whisper.cpp + Metal
                    └── Completes job (complete_job RPC) ← happy path

  [If macOS is offline or takes > 90s]

  └── pg_cron fires every 60s
        └── trigger_runpod_for_stale_jobs() SQL function
              └── Checks: any jobs pending > 90s?
                    └── Yes → POST /functions/v1/trigger-worker
                          └── trigger-worker edge function:
                                ├── claim_stale_job('runpod-serverless')
                                └── POST https://api.runpod.io/v2/{endpoint_id}/run
                                      └── { input: { audio: episode_url, model: "turbo" },
                                              webhook: "...runpod-callback?job_id=...&secret=..." }

  RunPod processes audio (~2–5 min for 1hr episode with turbo model)
    └── POST /functions/v1/runpod-callback?job_id=...&user_id=...&secret=...
          └── runpod-callback edge function:
                ├── Verify secret
                ├── Extract output.transcription
                ├── Upload to storage: transcripts/{user_id}/{job_id}.txt
                └── complete_job(job_id, path, 'runpod-serverless') RPC
```

### Secrets (set via `supabase secrets set`)

```
RUNPOD_API_KEY=<runpod api key>
RUNPOD_ENDPOINT_ID=<serverless endpoint ID from RunPod console>
RUNPOD_CALLBACK_URL=https://<project>.supabase.co/functions/v1/runpod-callback
RUNPOD_CALLBACK_SECRET=<random secret, e.g. openssl rand -hex 32>
```

### pg_cron setup (run once in Supabase SQL editor)

After applying migration `20260315000001_pg_cron_runpod_trigger.sql`, set the DB parameters so the cron function can call the edge function:

```sql
ALTER DATABASE postgres SET app.settings.supabase_url    = 'https://<project-ref>.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
```

Then reconnect (or run `SELECT pg_reload_conf();`) for the settings to take effect.

### RunPod Serverless endpoint setup

1. Go to [RunPod Console → Serverless → New Endpoint](https://console.runpod.io/serverless)
2. Select Hub worker: `runpod-workers/worker-faster_whisper`
3. Choose GPU: RTX 3090 or similar (24 GB VRAM)
4. Set max workers to 1 (or more for concurrent jobs)
5. Copy the endpoint ID — set as `RUNPOD_ENDPOINT_ID` secret

### Worker model selection

The `worker-faster_whisper` Hub worker accepts a `model` field in `input`:

| Model | Quality | Speed | Notes |
|---|---|---|---|
| `turbo` | Near large-v3 | ~8× faster | **Recommended** — best cost/quality |
| `large-v3` | Highest | Baseline | Use if accuracy is critical |
| `medium` | Good | ~2× faster | Budget option |

### Always-on mode (local dev / dedicated server)

The linux-worker Python daemon is still useful for:
- Local development with `WHISPER_DEVICE=cpu`
- A dedicated always-on GPU server (leave `RUNPOD_API_KEY`/`RUNPOD_POD_ID` unset)

In always-on mode, the worker polls every 30 seconds and uses Realtime for instant wake-up. pg_cron and trigger-worker are not needed.

---

## Observability: Structured Logging

All log output is **structured JSON** on stdout. Docker captures stdout; from there it can be shipped to any log aggregation system (Loki/Grafana, Datadog, CloudWatch, Seq, etc.) with a log driver or Promtail agent — no code changes required.

### Log Schema

Every log line is a JSON object. Common fields on every line:

| Field | Type | Example |
|---|---|---|
| `timestamp` | ISO 8601 | `"2026-03-14T09:23:01.412Z"` |
| `level` | string | `"info"` / `"warning"` / `"error"` |
| `event` | string | `"job.claimed"` |
| `worker_id` | string | `"debian-gpu-worker-01"` |

### URL sanitisation rule

URLs logged as `url_sanitised` strip query parameters before logging (scheme + host + path only). This prevents token leakage from podcast CDN URLs that embed auth tokens in query strings.

```python
# logged as: https://cdn.example.com/episodes/ep123.mp3
# not as:    https://cdn.example.com/episodes/ep123.mp3?token=secret&expires=...
```

### stderr truncation rule

ffmpeg and whisper stderr output is truncated to 500 characters before logging. Full stderr is never logged.

### Event Catalogue

#### Worker lifecycle

```json
{ "event": "worker.startup", "model": "large-v3", "device": "cuda", "compute_type": "int8", "load_time_ms": 4210 }
{ "event": "worker.shutdown", "reason": "SIGTERM" }
{ "event": "realtime.connected", "channel": "public:jobs" }
{ "event": "realtime.disconnected", "error": "WebSocket closed" }
{ "event": "realtime.reconnecting", "attempt": 3 }
```

#### Job lifecycle

```json
{ "event": "job.none_available", "sleep_s": 30 }
{ "event": "job.woken_by_realtime" }
{ "event": "job.claimed", "job_id": "uuid", "podcast_title": "...", "episode_title": "..." }
{ "event": "job.completed", "job_id": "uuid", "total_duration_ms": 38200 }
{ "event": "job.failed", "job_id": "uuid", "stage": "transcribe", "error": "CUDA out of memory", "total_duration_ms": 12100 }
{ "event": "job.timeout", "job_id": "uuid", "stage": "download", "timeout_s": 300 }
```

#### Download stage

```json
{ "event": "download.started", "job_id": "uuid", "url_sanitised": "https://cdn.example.com/ep.mp3" }
{ "event": "download.completed", "job_id": "uuid", "size_bytes": 52428800, "duration_ms": 3100, "content_type": "audio/mpeg" }
{ "event": "download.failed", "job_id": "uuid", "status_code": 403, "error": "Forbidden" }
```

#### Conversion stage

```json
{ "event": "convert.started", "job_id": "uuid", "input_format": "mp3" }
{ "event": "convert.completed", "job_id": "uuid", "duration_ms": 890 }
{ "event": "convert.failed", "job_id": "uuid", "error": "ffmpeg exit code 1", "stderr_truncated": "..." }
```

#### Transcription stage

```json
{ "event": "transcribe.started", "job_id": "uuid", "audio_duration_s": 3240 }
{ "event": "transcribe.progress", "job_id": "uuid", "pct_complete": 25 }
{ "event": "transcribe.completed", "job_id": "uuid", "audio_duration_s": 3240, "transcription_duration_ms": 187000, "realtime_factor": 17.3, "language": "en", "word_count": 24810 }
{ "event": "transcribe.failed", "job_id": "uuid", "error": "CUDA out of memory" }
```

#### Upload stage

```json
{ "event": "upload.started", "job_id": "uuid", "path": "uuid/uuid.txt" }
{ "event": "upload.completed", "job_id": "uuid", "path": "uuid/uuid.txt", "size_bytes": 148320, "duration_ms": 620 }
{ "event": "upload.failed", "job_id": "uuid", "error": "storage: bucket not found" }
```

### Useful Derived Metrics

From these logs a dashboard can derive:

- **Throughput**: jobs completed per hour (`job.completed` count)
- **Queue wait time**: `job.claimed.timestamp - job.created_at` (requires joining with DB, or add `created_at` to the `job.claimed` log event)
- **Transcription speed**: `realtime_factor` (higher is better; 17× = 1 hr audio in ~3.5 min)
- **Error rate**: `job.failed` count / total jobs, grouped by `stage`
- **Timeout rate**: `job.timeout` count grouped by `stage`
- **GPU saturation**: `transcription_duration_ms` vs `audio_duration_s`
- **Download reliability**: `download.failed` events grouped by `status_code`
- **Worker uptime**: `worker.startup` / `worker.shutdown` / `realtime.disconnected` events

---

## Environment Variables

```env
# Required
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>

# Worker identity (appears in jobs.worker_id and every log line)
WORKER_ID=debian-gpu-worker-01

# Whisper model config
WHISPER_MODEL=large-v3          # or medium, small, base
WHISPER_DEVICE=cuda             # or cpu
WHISPER_COMPUTE_TYPE=int8       # int8 recommended for T600 (~1.5 GB VRAM); float16 needs ~3 GB
WHISPER_BEAM_SIZE=5

# Per-stage timeouts (seconds)
TIMEOUT_DOWNLOAD=300
TIMEOUT_CONVERT=1800
TIMEOUT_TRANSCRIBE=14400
TIMEOUT_UPLOAD=120

# Tuning
POLL_INTERVAL_SECONDS=30
LOG_LEVEL=info                  # debug | info | warning | error
```

---

## Authentication

The mac app authenticates as the **user** via GitHub OAuth. A headless server cannot do this interactively.

The server worker uses the **`SUPABASE_SERVICE_ROLE_KEY`**, for the following reasons (verified by reading the migrations and edge function source):

### RPCs — any authenticated caller works today

`claim_next_job`, `complete_job`, and `fail_job` are all `SECURITY DEFINER` functions. They bypass RLS and can be called by any authenticated Supabase session. The service role key satisfies this.

**Important**: No explicit `GRANT EXECUTE` or `REVOKE EXECUTE` statements exist in the migrations, which means PostgreSQL's default of `EXECUTE` granted to `PUBLIC` applies. This means `anon` role callers can also invoke these RPCs via the REST API — a pre-existing exposure unrelated to the Linux worker. See Known Security Gaps below.

Worker token (`profiles.worker_token_hash`) is generated and stored but **never verified** in any RPC. It is currently unused.

### Storage upload — service role key required

The `transcripts` bucket has path-based RLS:
```sql
WITH CHECK (bucket_id = 'transcripts' AND (storage.foldername(name))[1] = auth.uid()::text)
```
A regular user JWT can only upload to its own `{user_id}/` folder. The server worker processes jobs belonging to **other users**, so it cannot satisfy this check with a user JWT. The service role key bypasses storage RLS entirely, allowing the worker to upload to any `{user_id}/{job_id}.txt` path. This is the same pattern used by `get-transcript-url` and `process-transcript` edge functions.

### Key handling

- Never committed to source control (`.env` and `.env.*` are gitignored)
- Injected at runtime via environment variable or secret manager
- Rotatable in Supabase dashboard → Settings → API if compromised
- **Blast radius if compromised**: full read/write access to all jobs and storage. Mitigations: restrict container network egress to Supabase hostnames only; treat key rotation as an incident response procedure.

---

## Known Security Gaps (pre-existing, not introduced by this worker)

These are documented here because they affect the trust model this worker relies on. They should be addressed in separate migrations.

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | No `REVOKE EXECUTE FROM anon` on RPCs — `anon` callers can invoke `claim_next_job`, `complete_job`, `fail_job` | High | **Fixed** — `20260314000000_harden_worker_rpcs.sql` revokes from PUBLIC, grants to `authenticated` only |
| 2 | `complete_job` / `fail_job` don't verify the caller is the worker that claimed the job | High | **Fixed** — added `p_worker_id` param + `AND worker_id = p_worker_id` WHERE guard; mac app and linux worker both pass worker ID |
| 3 | `claim_next_job` / `complete_job` / `fail_job` missing `SET search_path = public` | Low | **Fixed** — added to all three in `20260314000000_harden_worker_rpcs.sql` |
| 4 | Worker token (`profiles.worker_token_hash`) generated but never checked | Low | **Removed** — columns dropped in `20260314000001_remove_worker_token.sql`, edge function deleted, type definition cleaned up |

---

## GPU Concurrency Policy

**One worker container per GPU.** The T600 has ~1.8 GB VRAM free after existing workloads. `large-v3` with `int8` uses ~1.5 GB. Running two simultaneous transcriptions would OOM.

The `claim_next_job` RPC atomicity (`FOR UPDATE SKIP LOCKED`) guarantees no two workers claim the same job, so horizontal scaling across multiple GPUs (different machines) works correctly. On this specific server, deploy exactly one container.

If VRAM pressure increases (e.g. Immich or Scrypted consume more), fall back to `WHISPER_MODEL=medium WHISPER_COMPUTE_TYPE=int8_float16` (~0.8 GB).

---

## Deployment

Deployment is handled externally (Nomad job, systemd, or manual `docker run`). This repo provides only the image definition and a `docker-compose.yml` for local testing.

### Build the image

```bash
cd linux-worker
docker build -t transcribedd-worker:latest .
```

### Run (local / manual)

```bash
cd linux-worker
cp .env.example .env        # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID
docker compose up --build   # first run also downloads Whisper model (~1.5 GB for large-v3 int8)
docker compose up -d        # subsequent runs: detached
```

### GPU note (NVIDIA T600 — 4 GB VRAM)

The T600 has ~1.8 GB free after Scrypted and Immich ML. Recommended config:

| Model | Compute type | VRAM est. | Notes |
|---|---|---|---|
| `large-v3` | `int8` | ~1.5 GB | **Default** — best quality, fits comfortably |
| `medium` | `int8_float16` | ~0.8 GB | Safe fallback if VRAM pressure increases |

The default `.env.example` uses `large-v3` + `int8`.

---

## Multi-Worker Scaling

Multiple workers on **different machines** can run simultaneously against the same Supabase project. The `claim_next_job()` RPC uses `FOR UPDATE SKIP LOCKED` — the same atomicity guarantee already relied on by the mac app. No additional coordination is needed.

Each worker must have a unique `WORKER_ID` so `jobs.worker_id` identifies which machine processed each job, and so startup self-recovery (resetting own stuck jobs) targets only that worker's claims.

**Do not run multiple workers on the same GPU.** See GPU Concurrency Policy above.

---

## Implementation Steps

1. Create `linux-worker/` directory with `Dockerfile`, `docker-compose.yml`, `.env.example`, `requirements.txt`
2. Implement `worker/config.py` — env var loading, validation, and timeout values
3. Implement `worker/supabase_ops.py` — Supabase client init, RPC calls, storage upload, startup self-recovery
4. Implement `worker/downloader.py` — audio download with browser UA, timeout, temp file cleanup
5. Implement `worker/transcriber.py` — ffmpeg conversion + faster-whisper with progress and timeouts
6. Implement `worker/main.py` — event loop, Realtime subscription, poll fallback, per-stage timeout enforcement
7. Wire in `structlog` structured logging with URL sanitisation and stderr truncation throughout
8. Test locally with `WHISPER_DEVICE=cpu` before deploying to GPU server
9. Hand off image to operator for deployment
