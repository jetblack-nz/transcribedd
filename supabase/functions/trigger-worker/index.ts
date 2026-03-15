/**
 * trigger-worker
 *
 * Called every 60 s by pg_cron. Finds the oldest pending job that has been
 * waiting > 90 seconds (giving the macOS worker time to claim it via
 * Realtime first), claims it, and submits it to RunPod Serverless.
 *
 * Required secrets (set via `supabase secrets set`):
 *   RUNPOD_API_KEY          — RunPod API key
 *   RUNPOD_ENDPOINT_ID      — RunPod Serverless endpoint ID
 *   RUNPOD_CALLBACK_URL     — Full URL of runpod-callback edge function
 *                             e.g. https://xxxx.supabase.co/functions/v1/runpod-callback
 *   RUNPOD_CALLBACK_SECRET  — Shared secret appended to webhook URL for auth
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RUNPOD_WORKER_ID = 'runpod-serverless'
const STALE_SECONDS = 90

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const runpodApiKey   = Deno.env.get('RUNPOD_API_KEY')
  const endpointId     = Deno.env.get('RUNPOD_ENDPOINT_ID')
  const callbackUrl    = Deno.env.get('RUNPOD_CALLBACK_URL')
  const callbackSecret = Deno.env.get('RUNPOD_CALLBACK_SECRET')

  if (!runpodApiKey || !endpointId || !callbackUrl || !callbackSecret) {
    console.error('trigger-worker: missing RunPod configuration secrets')
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Claim the oldest pending job waiting longer than STALE_SECONDS
  const { data: jobs, error } = await admin.rpc('claim_stale_job', {
    p_worker_id: RUNPOD_WORKER_ID,
    p_stale_seconds: STALE_SECONDS,
  })

  if (error) {
    console.error('trigger-worker: claim_stale_job error', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const job = jobs?.[0]
  if (!job) {
    return new Response(JSON.stringify({ ok: true, message: 'no stale jobs' }), { status: 200 })
  }

  console.log(`trigger-worker: submitting job ${job.id} to RunPod endpoint ${endpointId}`)

  // Submit async job with webhook so RunPod calls us back when done
  const webhook = `${callbackUrl}?job_id=${job.id}&user_id=${job.user_id}&secret=${callbackSecret}`
  const runpodUrl = `https://api.runpod.io/v2/${endpointId}/run`

  try {
    const resp = await fetch(runpodUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runpodApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          audio: job.episode_url,
          model: 'turbo',
        },
        webhook,
      }),
    })

    const body = await resp.json()

    if (!resp.ok) {
      console.error(`trigger-worker: RunPod API error ${resp.status}`, body)
      await admin.rpc('fail_job', {
        p_job_id: job.id,
        p_error_message: `RunPod submission failed: HTTP ${resp.status}`,
        p_worker_id: RUNPOD_WORKER_ID,
      })
      // Return 200 so pg_cron doesn't retry — the error is already handled
      return new Response(JSON.stringify({ error: 'RunPod API error', status: resp.status }), { status: 200 })
    }

    console.log(`trigger-worker: RunPod job ${body.id} created for Supabase job ${job.id}`)
    return new Response(JSON.stringify({ ok: true, runpod_job_id: body.id, job_id: job.id }), { status: 200 })
  } catch (err) {
    console.error('trigger-worker: fetch failed', err)
    await admin.rpc('fail_job', {
      p_job_id: job.id,
      p_error_message: `RunPod submission error: ${err}`,
      p_worker_id: RUNPOD_WORKER_ID,
    }).catch(() => {})
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
