import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'

// Groq free tier: 6k TPM. Keep input well under ~1500 tokens (~6k chars) so
// there's budget for the system prompt and output tokens within the same window.
const MAX_CHUNK_CHARS = 6_000

function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = start + maxChars
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end)
      if (boundary > start + maxChars / 2) end = boundary + 1
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

/** Parse "Please try again in Xs" from a Groq rate-limit message. Falls back to `fallback` seconds. */
function parseRetryAfter(message: string, fallback = 15): number {
  const m = message.match(/try again in ([0-9.]+)s/)
  return m ? Math.ceil(parseFloat(m[1])) + 1 : fallback
}

async function groqChatWithRetry(
  apiKey: string,
  payload: unknown,
  maxRetries = 4,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const body = await resp.json()
    if (resp.status === 429) {
      if (attempt === maxRetries) {
        throw new Error(body.error?.message ?? 'Groq rate limit exceeded — please try again in a minute.')
      }
      const waitSecs = parseRetryAfter(body.error?.message ?? '', 15)
      await new Promise((r) => setTimeout(r, waitSecs * 1000))
      continue
    }
    if (!resp.ok) {
      throw new Error(body.error?.message ?? `Groq API error ${resp.status}`)
    }
    return body.choices?.[0]?.message?.content ?? ''
  }
  throw new Error('Groq request failed after retries')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Verify JWT via user client (standard Supabase edge function pattern)
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { jobId } = await req.json()
    if (!jobId || typeof jobId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Fetch job and verify ownership
    const { data: job, error: jobError } = await adminClient
      .from('jobs')
      .select('transcript_path, user_id')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (job.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }
    if (!job.transcript_path) {
      return new Response(
        JSON.stringify({ error: 'Transcript not available yet' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Fetch user's processing prompt
    const { data: profile } = await adminClient
      .from('profiles')
      .select('processing_prompt')
      .eq('id', user.id)
      .single()

    const processingPrompt = profile?.processing_prompt?.trim()
    if (!processingPrompt) {
      return new Response(
        JSON.stringify({ error: 'No processing prompt set. Add one in your dashboard settings.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    // Download the raw transcript from storage
    const { data: fileData, error: fileError } = await adminClient.storage
      .from('transcripts')
      .download(job.transcript_path)

    if (fileError || !fileData) {
      throw new Error(`Failed to fetch transcript: ${fileError?.message ?? 'unknown'}`)
    }
    const transcript = await fileData.text()

    // Call Groq — chunk the transcript to stay within free-tier TPM limits
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEY secret is not set on the server.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const chunks = splitIntoChunks(transcript, MAX_CHUNK_CHARS)
    const processedChunks: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      // Continuation chunks: suppress re-adding a title or intro heading
      const userContent = i === 0
        ? chunks[i]
        : `Continue formatting the transcript. Do not add a title, document heading, or any introductory text — pick up exactly where the previous section ended.\n\n${chunks[i]}`

      const result = await groqChatWithRetry(groqKey, {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: processingPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      })
      processedChunks.push(result)
    }

    const text = processedChunks.join('\n\n')

    return new Response(
      JSON.stringify({ text }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
