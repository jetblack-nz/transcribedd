# Security Fix Plan

Findings from security reviews (latest refresh: 2026-03-15).
Issues are ordered by severity and mapped to concrete files.

---

## Status legend
- ✅ Fixed — in `main`
- ❌ Not started
- ⚠️ Verify in environment — cannot be confirmed from repo alone

---

## Critical

### C-1 — Sign-up may still be open despite "invitation only" copy ⚠️
**Risk:** `AuthPage` says "Access by invitation only", but the client still exposes
`supabase.auth.signUp(...)`. If Supabase Auth "Enable Signups" is ON, anyone can create an
account directly via API.

**Evidence:**
- `web-app/frontend/src/pages/AuthPage.tsx`
- `web-app/frontend/src/hooks/useAuth.ts`

**Fix (Supabase Dashboard):**
1. Authentication → Settings.
2. Toggle **Enable Signups** OFF.
3. Use invite flow / allowlist as needed.

---

## High

### H-1 — Worker RPC privilege bypass via authenticated users ✅
**Status update:** Fixed in `main`.

**What was fixed:**
- `SET search_path = public` on worker RPCs
- `worker_id` ownership check on `complete_job`/`fail_job`
- `REVOKE EXECUTE ... FROM PUBLIC`, `GRANT ... TO authenticated`

**Evidence:**
- `supabase/migrations/20260314000000_harden_worker_rpcs.sql`

### H-2 — SSRF via `episode_url` ✅
**Status update:** Fixed in `main`.

**What was fixed:**
- Frontend URL validation rejects non-HTTPS and private/loopback ranges
- DB constraint enforces `episode_url LIKE 'https://%'`

**Evidence:**
- `web-app/frontend/src/hooks/useJobs.ts`
- `supabase/migrations/20260315000000_episode_url_https_constraint.sql`

### H-3 — RunPod callback secret in query string ✅
**Status update:** Fixed in `main`.

**What was fixed:**
- `trigger-worker` now computes `sig = HMAC-SHA256(RUNPOD_CALLBACK_SECRET, job_id)` and appends `?sig=` to the webhook URL — raw secret never appears in the URL
- `runpod-callback` validates the HMAC signature using `crypto.subtle.verify` (constant-time)
- Shared `hmac.ts` module contains `computeHmac` / `verifyHmac` helpers, covered by 8 unit tests

**Evidence:**
- `supabase/functions/runpod-callback/hmac.ts`
- `supabase/functions/runpod-callback/index.ts`
- `supabase/functions/runpod-callback/index.test.ts`
- `supabase/functions/trigger-worker/index.ts`

### H-4 — `runpod-callback` trusts `user_id` from request query ✅
**Status update:** Fixed in `main`.

**What was fixed:**
- `user_id` removed from webhook URL entirely — caller can no longer supply it
- `runpod-callback` fetches the job row by `job_id` via admin client and derives `user_id` from the DB
- Returns 404 if job row not found

**Evidence:**
- `supabase/functions/runpod-callback/index.ts`
- `supabase/functions/runpod-callback/index.test.ts`

---

## Medium

### M-1 — Missing HTTP security headers on web app ❌
**Risk:** No CSP, no clickjacking protection, no MIME sniff protection.

**Evidence:**
- `web-app/frontend/public/staticwebapp.config.json`

**Fix:** Add `globalHeaders` with at least:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` tuned for Vite + Supabase endpoints

### M-2 — `complete_job` / `fail_job` missing `SET search_path` ✅
**Status update:** Fixed in `main`.

**Evidence:**
- `supabase/migrations/20260314000000_harden_worker_rpcs.sql`

### M-3 — No server-side job creation rate limit ❌
**Risk:** Authenticated user can spam `jobs` inserts and burn queue/worker cost.

**Evidence:**
- `web-app/frontend/src/hooks/useJobs.ts`
- `supabase/migrations/` (no rate-limit trigger/function present)

**Fix:** Add DB-side guard (trigger or policy) to cap active jobs per user.

### M-4 — Edge functions leak raw internal errors ❌
**Risk:** Multiple edge functions return raw `error.message` to clients on 500 paths.

**Evidence:**
- `supabase/functions/get-transcript-url/index.ts`
- `supabase/functions/process-transcript/index.ts`
- `supabase/functions/trigger-worker/index.ts`
- `supabase/functions/runpod-callback/index.ts`

**Fix:** Return generic `{"error":"Internal server error"}` for 500s; keep detail in server logs only.

### M-5 — `audio-files` upload policy is over-broad ❌
**Risk:** Any authenticated user can upload arbitrary objects into `audio-files` bucket because
policy only checks `bucket_id = 'audio-files'`.

**Evidence:**
- `supabase/migrations/20260310000000_initial.sql`

**Fix:** Restrict insert path to user-scoped folder (or remove if bucket is not required).

---

## Low / Informational (backlog)

### L-1 — `supabaseAnonKey` in `UserDefaults` on macOS ❌
**Risk:** Stored in plaintext prefs (low risk because anon key is public, but not ideal).

**Evidence:**
- `mac-app/TranscribeddWorker/Settings/AppSettings.swift`

**Fix:** Move to `KeychainHelper` for consistency with sensitive app settings.

### L-2 — macOS realtime subscription may receive broad job events ❌
**Risk:** If subscription is unfiltered, worker sees metadata for all job inserts.

**Evidence:**
- `mac-app/TranscribeddWorker/AppState.swift`

**Fix:** Add user/job scoping filter where feasible.

### L-3 — OAuth callback logs URL query params to browser console ❌
**Risk:** Debug logs can include OAuth callback query parameters in browser console telemetry.

**Evidence:**
- `web-app/frontend/src/pages/AuthCallbackPage.tsx`

**Fix:** Remove/guard verbose callback logging in production.

---

## Recommended fix order

| Priority | Item | Effort | Type |
|---|---|---|---|
| 1 | C-1 Verify/disable open signups | 2 min | Dashboard |
| 2 | ~~H-3 Remove callback secret from query string~~ | ✅ done | Edge Function |
| 3 | ~~H-4 Derive `user_id` from job row in callback~~ | ✅ done | Edge Function |
| 4 | M-4 Sanitize all edge-function 500 errors | 20 min | Edge Functions |
| 5 | M-1 Add HTTP security headers | 15 min | Frontend config |
| 6 | M-3 Add DB job rate limit | 30 min | Migration |
| 7 | M-5 Tighten `audio-files` upload policy | 20 min | Migration |
| 8 | L-3 Remove OAuth callback debug logging | 10 min | Frontend |
| 9 | L-1/L-2 macOS hardening backlog | 30-60 min | Swift |
