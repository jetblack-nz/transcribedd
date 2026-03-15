/**
 * trigger-worker
 *
 * Called by a Supabase Database Webhook on INSERT to the jobs table.
 * Resumes the RunPod pod so it picks up the new job.
 *
 * Required secrets (set via `supabase secrets set`):
 *   RUNPOD_API_KEY   — RunPod API key
 *   RUNPOD_POD_ID    — ID of the stopped pod to resume
 */

const RUNPOD_API_BASE = 'https://rest.runpod.io/v1'

Deno.serve(async (req: Request): Promise<Response> => {
  // Supabase webhook sends a POST with the inserted row in the body.
  // We don't need the payload — any INSERT means "wake the worker".
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = Deno.env.get('RUNPOD_API_KEY')
  const podId  = Deno.env.get('RUNPOD_POD_ID')

  if (!apiKey || !podId) {
    console.error('trigger-worker: RUNPOD_API_KEY or RUNPOD_POD_ID not set')
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }

  const url = `${RUNPOD_API_BASE}/pods/${podId}/start`

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`trigger-worker: RunPod API error ${resp.status}: ${body}`)
      // Return 200 anyway — Supabase webhooks retry on non-2xx, and a
      // "pod already running" response is a 400 we should not retry.
      return new Response(JSON.stringify({ error: 'RunPod API error', status: resp.status }), { status: 200 })
    }

    console.log(`trigger-worker: pod ${podId} resume requested`)
    return new Response(JSON.stringify({ ok: true, pod_id: podId }), { status: 200 })
  } catch (err) {
    console.error('trigger-worker: fetch failed', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
