/**
 * runpod-callback
 *
 * Receives the RunPod Serverless webhook when a job finishes.
 * Uploads the transcript to Supabase Storage and calls complete_job,
 * or calls fail_job if RunPod reports an error.
 *
 * URL query params (appended by trigger-worker):
 *   job_id  — Supabase jobs.id (UUID)
 *   user_id — jobs.user_id
 *   secret  — must match RUNPOD_CALLBACK_SECRET env var
 *
 * RunPod webhook payload shape:
 *   { id, status: "COMPLETED"|"FAILED"|"CANCELLED"|"IN_PROGRESS", output: { transcription: "..." }, error?: "..." }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RUNPOD_WORKER_ID = 'runpod-serverless'

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url    = new URL(req.url)
  const jobId  = url.searchParams.get('job_id')
  const userId = url.searchParams.get('user_id')
  const secret = url.searchParams.get('secret')

  if (!secret || secret !== Deno.env.get('RUNPOD_CALLBACK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!jobId || !userId) {
    return new Response('Missing job_id or user_id', { status: 400 })
  }

  const payload = await req.json()
  const status  = payload.status as string

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

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

  // Upload transcript to private storage bucket
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
    // Best-effort cleanup — don't leave orphaned transcript
    await admin.storage.from('transcripts').remove([storagePath]).catch(() => {})
    return new Response(JSON.stringify({ error: completeError.message }), { status: 500 })
  }

  console.log(`runpod-callback: job ${jobId} completed successfully`)
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
