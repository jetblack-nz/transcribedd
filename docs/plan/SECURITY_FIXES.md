# Security Fix Plan

Findings from a penetration-test of the MVP (10 March 2026).
Issues are ordered by severity. Each entry lists the exact file(s) to change and the fix.

---

## Status legend
- ✅ Fixed — in `main`
- 🔧 Fix ready — local edits not yet deployed
- ❌ Not started

---

## Critical

### C-1 — Sign-up is not enforced as invite-only ❌
**Risk:** Anyone can create an account directly via the Supabase API even though the UI says
"Access by invitation only". A full anon key + project URL is enough to call
`supabase.auth.signUp()` from any browser console.

**Fix (Supabase Dashboard — no code change needed):**
1. Supabase Dashboard → Project → Authentication → Settings.
2. Toggle **"Enable Signups"** OFF.
3. Use *Invite user* (Auth → Users → Invite) to add allowed addresses, or switch to
   email-allowlist if the feature is available on your plan.

---

## High

### H-1 — Any authenticated user can manipulate any job via RPCs ❌
**Risk:** `claim_next_job`, `complete_job`, and `fail_job` are `SECURITY DEFINER` functions
that bypass RLS entirely. Any signed-in user who knows the Supabase URL and their own JWT can
call these RPCs directly and steal, complete, or fail jobs belonging to other users.
`complete_job` is especially dangerous — it accepts an arbitrary `transcript_path`, allowing a
malicious user to point any completed job at a file they control.

**Files to change:**
- `supabase/migrations/<new>_rpc_worker_auth.sql` (new migration)
- `supabase/functions/create-worker-token/index.ts` (no change needed)

**Fix:** Add an `is_worker` boolean flag to `profiles` and gate all three RPCs on it:

```sql
-- Migration: YYYYMMDDHHMMSS_rpc_worker_auth.sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_worker BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION claim_next_job(p_worker_id TEXT)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job jobs;
BEGIN
  -- Caller must be a registered worker
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_worker = true
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE jobs j
  SET status = 'processing', worker_id = p_worker_id, started_at = NOW()
  WHERE j.id = (
    SELECT id FROM jobs WHERE status = 'pending'
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  RETURNING * INTO v_job;

  IF v_job.id IS NOT NULL THEN RETURN NEXT v_job; END IF;
END;
$$;

-- Apply the same SECURITY guard to complete_job and fail_job (same pattern)
```

Then set `is_worker = true` for your own profile row once (via Dashboard SQL editor), and
update `create-worker-token` to also set it when issuing a token.

### H-2 — SSRF via `episode_url` ❌
**Risk:** The macOS worker fetches `jobs.episode_url` unconditionally with `URLSession`. A
logged-in user can create a job whose `episode_url` points to an internal address
(`http://169.254.169.254/...`, `http://localhost/...`, or any private subnet resource
reachable from the worker machine) and the worker will request it.

**Files to change:**
- `web-app/frontend/src/hooks/useJobs.ts` — validate before calling `.insert()`
- Optional: `supabase/migrations/<new>_episode_url_check.sql` — DB-level constraint as defence-in-depth

**Fix (frontend `createJob`):**
```typescript
// In useJobs.ts createJob(), before the supabase.from('jobs').insert(...)
const parsed = (() => { try { return new URL(job.episode_url ?? '') } catch { return null } })()
if (!parsed || parsed.protocol !== 'https:' || /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)) {
  throw new Error('Invalid episode URL — must be a public HTTPS address')
}
```

**Fix (DB constraint):**
```sql
ALTER TABLE jobs ADD CONSTRAINT episode_url_https
  CHECK (episode_url LIKE 'https://%');
```

---

## Medium

### M-1 — Missing HTTP security headers ❌
**Risk:** No `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`.
The app is vulnerable to clickjacking and MIME-sniffing attacks.

**File to change:** `web-app/frontend/public/staticwebapp.config.json`

**Fix:**
```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.{css,js,ico,png,svg,woff2}"]
  },
  "globalHeaders": {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://itunes.apple.com; frame-ancestors 'none'"
  }
}
```

> Note: `'unsafe-inline'` is needed because Vite injects inline styles/scripts. Can be
> tightened with a nonce-based policy later.

### M-2 — `complete_job` and `fail_job` missing `SET search_path` ❌
**Risk:** PostgreSQL search path injection — a superuser or malicious extension could shadow
`public.jobs` via a schema earlier in the search path. Low exploitability in practice on
Supabase, but it's a hardening best practice and is already applied to `handle_new_user`.

**File to change:** `supabase/migrations/<new>_rpc_search_path.sql`

**Fix:**
```sql
-- Can be combined with H-1 migration above
CREATE OR REPLACE FUNCTION complete_job(p_job_id UUID, p_transcript_path TEXT)
  ... (same body)
  SECURITY DEFINER
  SET search_path = public  -- add this line
AS $$ ... $$;

CREATE OR REPLACE FUNCTION fail_job(p_job_id UUID, p_error_message TEXT)
  ...
  SET search_path = public
AS $$ ... $$;
```

### M-3 — No job creation rate limit ❌
**Risk:** A signed-in user can spam the `POST /jobs` endpoint (or call
`supabase.from('jobs').insert(...)` in a loop) to queue unlimited jobs, burning worker
compute and Supabase row-insert quota.

**File to change:** `supabase/migrations/<new>_job_rate_limit.sql`

**Fix:** DB-level guard via a trigger or RLS check:
```sql
CREATE OR REPLACE FUNCTION check_job_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM jobs
    WHERE user_id = NEW.user_id
      AND status IN ('pending', 'processing')
  ) >= 5 THEN
    RAISE EXCEPTION 'Rate limit: max 5 active jobs at a time';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_job_rate_limit
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION check_job_rate_limit();
```

### M-4 — `get-transcript-url` leaks raw error message 🔧
**Risk:** An unexpected Supabase storage error in the catch block is returned verbatim to the
client, potentially exposing internal paths, bucket names, or query structure.

**File to change:** `supabase/functions/get-transcript-url/index.ts`

**Fix:** Replace the final `catch` block (same pattern already applied to the other two functions):
```typescript
// Replace:
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return new Response(
    JSON.stringify({ error: message }),
    ...
  )
}

// With:
} catch {
  return new Response(
    JSON.stringify({ error: 'Internal server error' }),
    { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}
```

---

## Low / Informational (backlog)

### L-1 — `supabaseAnonKey` stored in `UserDefaults` on macOS ❌
The anon key is placed in `UserDefaults` (a plain plist on disk) in `AppSettings.swift`.
While the anon key is nominally public, defence-in-depth suggests it should live in Keychain
alongside the worker token.  
**File:** `mac-app/TranscribeddWorker/Settings/AppSettings.swift` — use `KeychainHelper`
for `supabaseAnonKey` and `supabaseURL`.

### L-2 — Realtime subscription receives all job inserts ❌
`AppState.swift` subscribes to all INSERT events on `jobs` without a `user_id` filter.
Each worker sees metadata about every new job across all users (though it can only claim one).
**Fix:** Add `filter: "user_id=eq.\(userId)"` to the `postgresChange` subscription options,
matching the same filter used in the web app's `useJobs` hook.

### L-3 — Worker token exists but is never verified ❌
`create-worker-token` generates and stores a `worker_token_hash`, but the mac app authenticates
via GitHub/Google OAuth and never presents this token when calling RPCs. The token does nothing
today. This creates a false sense of security for anyone reading the UI.  
**Options:** Either wire it up (see H-1 above) or remove the token UI and the
`create-worker-token` function until H-1 is implemented.

---

## Recommended fix order

| Priority | Item | Effort | Type |
|---|---|---|---|
| 1 | C-1 Sign-up toggle | 2 min | Dashboard |
| 2 | M-4 Error leak in `get-transcript-url` | 5 min | Code + deploy |
| 3 | M-1 Security headers | 10 min | Config + deploy |
| 4 | M-2 + M-3 SQL search_path + rate limit | 20 min | Migration |
| 5 | H-1 RPC worker auth | 1 h | Migration + code |
| 6 | H-2 SSRF URL validation | 30 min | Code + deploy |
| 7 | L-1 Keychain for anonKey | 30 min | Swift |
| 8 | L-2 Realtime filter | 10 min | Swift |
| 9 | L-3 Wire up / remove worker token | tbd | Code |
