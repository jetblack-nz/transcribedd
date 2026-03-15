/**
 * runpod-callback
 *
 * Receives the RunPod Serverless webhook when a job finishes.
 * Uploads the transcript to Supabase Storage and calls complete_job,
 * or calls fail_job if RunPod reports an error.
 *
 * URL query params (appended by trigger-worker):
 *   job_id — Supabase jobs.id (UUID)
 *   sig    — HMAC-SHA256(RUNPOD_CALLBACK_SECRET, job_id) — no raw secret in URL (H-3)
 *
 * user_id is derived server-side from the job row, never trusted from the caller (H-4).
 *
 * RunPod webhook payload shape:
 *   { id, status: "COMPLETED"|"FAILED"|"CANCELLED"|"IN_PROGRESS", output: { transcription: "..." }, error?: "..." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyHmac } from './hmac.ts'

const RUNPOD_WORKER_ID = 'runpod-serverless'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url   = new URL(req.url)
  const jobId = url.searchParams.get('job_id')
  const sig   = url.searchParams.get('sig')

  if (!jobId) {
    return new Response('Missing job_id', { status: 400 })
  }

  // H-3: validate HMAC signature — raw secret never appears in the URL
  const callbackSecret = Deno.env.get('RUNPOD_CALLBACK_SECRET') ?? ''
  if (!sig || !(await verifyHmac(callbackSecret, jobId, sig))) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // H-4: derive user_id server-side from the job row — never trust caller-supplied value
  const { data: jobRow, error: jobError } = await admin
    .from('jobs')
    .select('user_id')
    .eq('id', jobId)
    .single()

  if (jobError || !jobRow) {
    console.error(`runpod-callback: job ${jobId} not found`, jobError)
    return new Response('Job not found', { status: 404 })
  }

  const userId = jobRow.user_id as string

  const payload = await req.json()
  const status  = payload.status as string

  // Non-terminal status (e.g. IN_PROGRESS) — acknowledge and ignore
  if (status !== 'COMPLETED' && status !== 'FAILED' && status !== 'CANCELLED') {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  if (status === 'FAILED' || status === 'CANCELLED') {
    const errMsg = payload.error ?? `RunPod job ${status.toLowerCase()}`
    console.error(`runpod-callback: job ${jobId} ${status}: ${errMsg}`)
    await admin.rpc('fail_job', {
      p_job_id: jobId,
      p_error_message: errMsg,
      p_worker_id: RUNPOD_WORKER_ID,
    })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // COMPLETED — extract transcript
  const transcription = payload.output?.transcription as string | undefined
  if (!transcription) {
    console.error(`runpod-callback: job ${jobId} completed but output.transcription is empty`)
    await admin.rpc('fail_job', {
      p_job_id: jobId,
      p_error_message: 'RunPod returned no transcription',
      p_worker_id: RUNPOD_WORKER_ID,
    })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // Upload transcript to private storage bucket using server-side userId
  const storagePath = `${userId}/${jobId}.txt`
  const { error: uploadError } = await admin.storage
    .from('transcripts')
    .upload(storagePath, transcription, {
      contentType: 'text/plain',
      upsert: true,
    })

  if (uploadError) {
    console.error(`runpod-callback: upload failed for job ${jobId}`, uploadError)
    await admin.rpc('fail_job', {
      p_job_id: jobId,
      p_error_message: `Transcript upload failed: ${uploadError.message}`,
      p_worker_id: RUNPOD_WORKER_ID,
    })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // Mark job complete
  const { error: completeError } = await admin.rpc('complete_job', {
    p_job_id: jobId,
    p_transcript_path: storagePath,
    p_worker_id: RUNPOD_WORKER_ID,
  })

  if (completeError) {
    console.error(`runpod-callback: complete_job failed for job ${jobId}`, completeError)
    await admin.storage.from('transcripts').remove([storagePath]).catch(() => {})
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }

  console.log(`runpod-callback: job ${jobId} completed successfully`)
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
