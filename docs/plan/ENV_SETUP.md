# Environment Variables Configuration (Supabase MVP)

Use this document for secure environment setup. Do not commit local env files.

## Core Principle
- Public client env: Supabase URL + anon key only
- Secrets (Podcast Index secret, service role key): server-side only (Edge Functions or secret manager)

## Frontend (`web-app/frontend/.env.local`)
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PODCAST_SEARCH_FUNCTION_URL=https://xxxxx.supabase.co/functions/v1/podcast-search
```

Allowed in frontend:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Edge function URL

Not allowed in frontend:
- Podcast Index API secret
- Supabase service role key
- Any private signing keys

## Supabase Edge Function Secrets
Store these in Supabase secrets, not in frontend env files:
```bash
supabase secrets set PODCAST_INDEX_KEY=your-key
supabase secrets set PODCAST_INDEX_SECRET=your-secret
supabase secrets set INTERNAL_SIGNING_SECRET=your-internal-secret
```

## macOS Worker Configuration
Store worker token in macOS Keychain.

Recommended app config fields:
- `supabaseURL`
- `supabaseAnonKey`
- `workerId`
- `workerToken` (Keychain)
- `whisperModel` (`small` default)

## Data Retention Defaults
- Audio retention: 24 hours
- Transcript retention: 180 days (default)

## Security Checklist
- [ ] RLS enabled on `jobs` and `profiles`
- [ ] Transcript bucket private
- [ ] Signed URL downloads (short TTL)
- [ ] Worker token hash at rest (raw token shown once)
- [ ] Podcast Index secret only in Edge Functions
- [ ] Service role key never shipped to client

## Verification
1. Search frontend code for `PODCAST_INDEX_SECRET` and `SERVICE_ROLE` (should be none).
2. Verify transcript bucket is private.
3. Verify signed URL endpoint works and expires as expected.
4. Verify worker token rotation/revocation flow.

## Notes
For local MVP development, direct cloud Supabase usage is fine. Use local Supabase CLI only if needed for advanced workflows.
