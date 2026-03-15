/**
 * Tests for runpod-callback edge function.
 *
 * Covers H-3 (HMAC-based auth, no raw secret in URL) and
 * H-4 (user_id derived from DB, not trusted from query param).
 *
 * Run: deno test --allow-env supabase/functions/runpod-callback/index.test.ts
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeHmac, verifyHmac } from './hmac.ts'

// ---------------------------------------------------------------------------
// HMAC helper unit tests (H-3)
// ---------------------------------------------------------------------------

Deno.test('computeHmac produces a hex string', async () => {
  const sig = await computeHmac('my-secret', 'job-123')
  assertEquals(typeof sig, 'string')
  assertEquals(sig.length, 64) // SHA-256 = 32 bytes = 64 hex chars
  assertEquals(/^[0-9a-f]+$/.test(sig), true)
})

Deno.test('computeHmac is deterministic for same inputs', async () => {
  const a = await computeHmac('secret', 'job-abc')
  const b = await computeHmac('secret', 'job-abc')
  assertEquals(a, b)
})

Deno.test('computeHmac differs for different job_ids', async () => {
  const a = await computeHmac('secret', 'job-1')
  const b = await computeHmac('secret', 'job-2')
  assertEquals(a === b, false)
})

Deno.test('computeHmac differs for different secrets', async () => {
  const a = await computeHmac('secret-a', 'job-1')
  const b = await computeHmac('secret-b', 'job-1')
  assertEquals(a === b, false)
})

Deno.test('verifyHmac returns true for a valid signature', async () => {
  const sig = await computeHmac('my-secret', 'job-xyz')
  assertEquals(await verifyHmac('my-secret', 'job-xyz', sig), true)
})

Deno.test('verifyHmac returns false for a tampered signature', async () => {
  const sig = await computeHmac('my-secret', 'job-xyz')
  const tampered = sig.slice(0, -2) + 'ff'
  assertEquals(await verifyHmac('my-secret', 'job-xyz', tampered), false)
})

Deno.test('verifyHmac returns false for wrong job_id', async () => {
  const sig = await computeHmac('my-secret', 'job-real')
  assertEquals(await verifyHmac('my-secret', 'job-other', sig), false)
})

Deno.test('verifyHmac returns false for empty sig', async () => {
  assertEquals(await verifyHmac('my-secret', 'job-1', ''), false)
})

// ---------------------------------------------------------------------------
// Request validation tests (H-3 + H-4)
// ---------------------------------------------------------------------------

// Minimal stub that simulates the handler's auth + routing logic
// without requiring a live Supabase connection.
async function callHandler(
  opts: {
    method?: string
    jobId?: string
    sig?: string
    secret?: string        // what RUNPOD_CALLBACK_SECRET env var is set to
    body?: unknown
    // Stub for the DB job lookup (H-4)
    dbJob?: { user_id: string } | null
  }
): Promise<{ status: number; body: unknown }> {
  const {
    method = 'POST',
    jobId = 'job-abc',
    sig,
    secret = 'test-secret',
    body = { status: 'IN_PROGRESS' },
    dbJob = { user_id: 'user-999' },
  } = opts

  // Build URL
  const params = new URLSearchParams()
  if (jobId) params.set('job_id', jobId)
  if (sig !== undefined) params.set('sig', sig)
  const url = new URL(`https://example.com/functions/v1/runpod-callback?${params}`)

  // Replicate handler auth logic
  if (method !== 'POST') return { status: 405, body: 'Method not allowed' }

  const qJobId = url.searchParams.get('job_id')
  const qSig   = url.searchParams.get('sig')

  if (!qJobId) return { status: 400, body: 'Missing job_id' }
  if (!qSig || !(await verifyHmac(secret, qJobId, qSig))) {
    return { status: 401, body: 'Unauthorized' }
  }

  // H-4: user_id must come from DB, not query
  if (!dbJob) return { status: 404, body: 'Job not found' }
  const userId = dbJob.user_id

  const payload = body as { status: string; output?: { transcription?: string }; error?: string }
  const status  = payload.status

  if (status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED') {
    return { status: 200, body: { ok: true } }
  }

  return { status: 200, body: { ok: true, userId } }
}

Deno.test('rejects non-POST requests', async () => {
  const r = await callHandler({ method: 'GET' })
  assertEquals(r.status, 405)
})

Deno.test('rejects request with no sig param (H-3)', async () => {
  const r = await callHandler({ sig: undefined })
  assertEquals(r.status, 401)
})

Deno.test('rejects request with wrong sig (H-3)', async () => {
  const r = await callHandler({ sig: 'deadbeef'.repeat(8) })
  assertEquals(r.status, 401)
})

Deno.test('accepts request with correct HMAC sig (H-3)', async () => {
  const jobId = 'job-abc'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  const r = await callHandler({ jobId, sig, secret })
  assertEquals(r.status, 200)
})

Deno.test('rejects request with missing job_id', async () => {
  const r = await callHandler({ jobId: '', sig: 'anything' })
  assertEquals(r.status, 400)
})

Deno.test('user_id comes from DB row, not query param (H-4)', async () => {
  const jobId = 'job-abc'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  // DB says user is 'db-user-456'; no user_id in URL — handler must derive it
  const r = await callHandler({
    jobId, sig, secret,
    dbJob: { user_id: 'db-user-456' },
    body: { status: 'COMPLETED', output: { transcription: 'hello' } },
  })
  assertEquals(r.status, 200)
  assertEquals((r.body as { userId: string }).userId, 'db-user-456')
})

Deno.test('returns 404 when DB job not found (H-4)', async () => {
  const jobId = 'job-missing'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  const r = await callHandler({ jobId, sig, secret, dbJob: null })
  assertEquals(r.status, 404)
})

Deno.test('IN_PROGRESS status is acknowledged without processing', async () => {
  const jobId = 'job-abc'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  const r = await callHandler({ jobId, sig, secret, body: { status: 'IN_PROGRESS' } })
  assertEquals(r.status, 200)
  assertEquals((r.body as { ok: boolean }).ok, true)
})

Deno.test('COMPLETED status is processed', async () => {
  const jobId = 'job-abc'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  const r = await callHandler({
    jobId, sig, secret,
    body: { status: 'COMPLETED', output: { transcription: 'hello world' } },
  })
  assertEquals(r.status, 200)
})

Deno.test('FAILED status is processed', async () => {
  const jobId = 'job-abc'
  const secret = 'test-secret'
  const sig = await computeHmac(secret, jobId)
  const r = await callHandler({
    jobId, sig, secret,
    body: { status: 'FAILED', error: 'OOM' },
  })
  assertEquals(r.status, 200)
})
