# Conventions — Transcribedd

## General

- Prefer editing existing files over creating new ones
- Keep logic minimal — no speculative abstractions or future-proofing
- Never expose secrets; sensitive keys live in environment variables or macOS Keychain
- Three similar lines of code is better than a premature abstraction

---

## Web App (TypeScript / React)

### File & Folder Naming
| Thing | Convention | Example |
|---|---|---|
| Component files | PascalCase | `JobCard.tsx`, `DashboardPage.tsx` |
| Hook files | camelCase with `use` prefix | `useAuth.ts`, `useJobs.ts` |
| Test files | Co-located, same name + `.test` | `JobCard.test.tsx`, `useAuth.test.ts` |
| Utility / lib files | camelCase | `supabase.ts` |
| Type files | `index.ts` inside `types/` | `types/index.ts` |

### Component Conventions
- Every component and hook gets a co-located `.test.tsx` / `.test.ts`
- Authenticated pages are wrapped in `<ProtectedRoute>`
- Use `useAuth` and `useJobs` as the pattern for new feature hooks
- Use Tailwind CSS v4 for styling — no CSS-in-JS, no inline `style={{}}`
- Use the `supabase` client from `lib/supabase.ts` — never create a secondary client

### State Management
- Use `supabase` realtime + local React state for job data (via `useJobs`)
- Avoid `@tanstack/react-query` for Supabase subscriptions — direct hook pattern is in use
- Local component state (`useState`) is fine for UI-only state (loading, error, form values)

### Error Handling
- Hooks surface errors via returned `error` state (`string | null`)
- Component `handleSubmit` functions use `try/catch`, set `error` state from `err.message`
- Never swallow errors silently — always set state or rethrow
- Supabase errors are objects with a `message` property — use `(err as any)?.message`

### TypeScript
- Strict mode enabled (`tsconfig.app.json`)
- Prefer explicit return types on hooks
- Shared types in `src/types/index.ts`
- Test files excluded from `tsconfig.app.json` (separate `vitest.config.ts`)

---

## Testing (Vitest + Playwright)

### Unit Tests
- Use `vi.hoisted()` + `vi.mock()` pattern for all Supabase mocks
- Mock Supabase at the module level — never let real network calls through in unit tests
- Use `render` from `src/test/utils/test-utils.tsx` (wraps with Router + providers)
- Use `createMockJob()` / `createMockJobs()` from `src/test/mocks/data.ts` for test data
- Use `userEvent.setup()` (not `fireEvent`) for user interactions
- Use `waitFor()` for async assertions
- Avoid fake timers for tests involving `userEvent` — use real timers with extended timeout (10s) instead

### E2E Tests (Playwright)
- Test files live in `e2e/`
- Use the `test` and `expect` exports from `e2e/fixtures.ts` (not directly from `@playwright/test`)
- The `authenticatedPage` fixture handles login/logout automatically
- `.env.local` is loaded by `playwright.config.ts` at startup

---

## Supabase (SQL / Migrations)

### Migration Naming
```
YYYYMMDDHHMMSS_description.sql
```
Example: `20260314000000_harden_worker_rpcs.sql`

### SQL Conventions
- All new tables must have RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- All RLS policies follow the pattern: `auth.uid() = user_id`
- Privileged functions use `SECURITY DEFINER` + `SET search_path = public`
- Atomic operations use `FOR UPDATE SKIP LOCKED`
- Never write a naive `UPDATE` for job claiming — always use the `claim_next_job()` RPC

### Edge Functions
- Error responses return `{ error: 'Internal server error' }` — never leak raw error messages
- CORS headers are included on all responses
- Secrets accessed via `Deno.env.get()` — never hardcoded

---

## Python Worker (`linux-worker/`)

### Naming
- Modules: `snake_case` (`supabase_ops.py`, `downloader.py`)
- Functions: `snake_case` (`claim_next_job`, `upload_transcript`)
- Config: `SCREAMING_SNAKE_CASE` env vars, accessed via `Config` dataclass

### Logging
- Use `structlog` with JSON output — no bare `print()` calls
- Bind context to logger: `log = structlog.get_logger().bind(job_id=job_id)`
- Log event names use dot-separated namespacing: `"download.started"`, `"job.completed"`

### Error Handling
- Catch `asyncio.TimeoutError` and generic `Exception` separately in `process_job()`
- Always call `fail_job()` on any exception so the job doesn't get stuck in `processing`
- Clean up temp files in `finally` block

---

## macOS Worker (Swift)

### Naming
- Types: `PascalCase` (`SupabaseService`, `TranscriptionService`)
- Properties / functions: `camelCase`
- Files: `PascalCase.swift`, matching the type they contain

### Concurrency
- Strict concurrency enabled (`-strict-concurrency=complete`)
- Use `async/await` — no callback-based patterns unless wrapping legacy APIs
- `@MainActor` for UI-bound state in `AppState`

### Secrets
- Worker auth token: stored in macOS Keychain via `KeychainHelper`, never `UserDefaults`
- Supabase URL + anon key: currently in `AppSettings` / `UserDefaults` (known issue — see `SECURITY_FIXES.md` L-1)
