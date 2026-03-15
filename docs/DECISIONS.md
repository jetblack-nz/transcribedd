# Architecture Decision Records — Transcribedd

## ADR-001: Supabase as the sole backend platform

**Why:** For a 2–50 user MVP, Supabase provides PostgreSQL + Auth + Realtime + Storage + Edge Functions in a single free-tier service. Building a custom backend would take 4 weeks and cost $15–60/month. Supabase took 10 minutes to set up and costs $0/month.

**Trade-offs:**
- ✅ Zero backend code to write or operate
- ✅ RLS, JWT, realtime subscriptions built-in
- ❌ Vendor lock-in — migration to Azure/custom backend is non-trivial
- ❌ Free tier limits (500MB DB, 1GB storage, 2GB bandwidth) become relevant at ~50+ active users

**Date:** 2026-03-10

---

## ADR-002: Local transcription (no cloud ASR)

**Why:** Transcribing via whisper locally on the user's machine means zero API cost per transcription (vs $0.37–1.44/hour for cloud ASR), keeps audio data private, and removes network dependency during transcription.

**Trade-offs:**
- ✅ $0 per transcription indefinitely
- ✅ Audio never leaves user's machine
- ❌ Requires a worker app running on a Mac or Linux machine
- ❌ Speed depends on user's hardware
- ❌ Can't transcribe if no worker is online

**Date:** 2026-03-10

---

## ADR-003: macOS worker as native Swift + SwiftUI menu-bar app

**Why:** Native Swift gives battery efficiency, smaller binary (~10MB vs ~150MB Electron), correct system-tray/notification integration, and access to Keychain. macOS is the primary target platform.

**Trade-offs:**
- ✅ Native performance and UX
- ✅ Keychain integration for secure credential storage
- ❌ macOS-only — no Windows/Linux coverage via this path
- ❌ Requires Xcode and Apple Developer toolchain

**Date:** 2026-03-10

---

## ADR-004: Linux worker as a separate Python Docker service

**Why:** To support non-Mac environments (servers, VMs, CI) and to use `faster-whisper` (CTranslate2-based, ~2–4x faster than openai-whisper). The Python worker is containerised for portability.

**Trade-offs:**
- ✅ Runs anywhere Docker runs
- ✅ `faster-whisper` is significantly faster on CPU and GPU
- ✅ Structured JSON logging (`structlog`) suitable for log aggregation
- ❌ Duplicates some logic with the macOS worker (different language)
- ❌ Two codebases to maintain for the same job lifecycle

**Date:** 2026-03-14 (inferred from git history)

---

## ADR-005: Jobs table as the job queue

**Why:** A dedicated queue system (SQS, RabbitMQ, etc.) would add infrastructure complexity and cost. PostgreSQL with `FOR UPDATE SKIP LOCKED` provides atomic, safe job claiming without an extra service.

**Trade-offs:**
- ✅ No extra infrastructure
- ✅ RLS and audit trail built-in
- ✅ Realtime subscription replaces polling
- ❌ Not suitable for very high throughput (>100 concurrent jobs)
- ❌ No retry count / DLQ — failed jobs stay failed

**Date:** 2026-03-10

---

## ADR-006: Podcast Index API proxied through Edge Function

**Why:** The Podcast Index API requires HMAC-SHA1 signing with an API key + secret. Doing this in browser-side JS would expose the secret. The `podcast-search` Edge Function signs requests server-side.

**Trade-offs:**
- ✅ API secret never reaches the client
- ✅ Consistent with the "all secrets server-side" rule
- ❌ Extra latency hop for search queries

**Date:** 2026-03-10

---

## ADR-007: Transcript access via signed URLs only

**Why:** Transcripts contain user content and should not be publicly accessible. The `get-transcript-url` Edge Function generates time-limited (≤15 min) signed URLs per request. Storage bucket is private.

**Trade-offs:**
- ✅ Transcripts are never accidentally public
- ✅ Links expire automatically
- ❌ Browser can't cache downloads (URL changes each time)

**Date:** 2026-03-10

---

## ADR-008: Groq for AI transcript post-processing

**Why:** The "Download (docx)" feature applies an AI formatting prompt to the raw transcript. Groq was chosen for speed and free-tier availability.

**Trade-offs:**
- ✅ Fast inference, free tier available
- ❌ External API dependency — if Groq is down, docx download fails
- ❌ Large transcripts are chunked and retried, adding latency

**Date:** 2026-03-12 (inferred from `feat: add deluxe download with AI processing via Groq`)

---

## ADR-009: Azure Static Web Apps for frontend hosting

**Why:** The project was initially planned for Azure, and Azure Static Web Apps provides free hosting with GitHub Actions CI/CD integration. The CI pipeline already existed.

**Trade-offs:**
- ✅ Free tier, automatic deploys on push to `main`
- ✅ Global CDN included
- ❌ The original plan docs reference Vercel/Netlify — Azure was the actual choice
- ❌ Requires Azure account and workflow file

**Date:** 2026-03-10 (inferred from CI workflow file)

---

## ADR-010: Worker token authentication removed

**Why:** The `create-worker-token` Edge Function was built but the token was never verified in RPCs — it created a false sense of security. Workers authenticate via Supabase Auth (Google/GitHub OAuth) instead. The token UI and Edge Function were removed.

**Trade-offs:**
- ✅ Removes misleading security indicator
- ❌ `is_worker` RPC gating (H-1 in SECURITY_FIXES.md) is still not implemented — any authenticated user can call worker RPCs

**Date:** 2026-03-14 (inferred from `feat: remove macOS worker token section from dashboard UI`)
