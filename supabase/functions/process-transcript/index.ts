import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

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

    // Verify caller is authenticated
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
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

    const { jobId } = await req.json()
    if (!jobId || typeof jobId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'jobId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

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

    // Call Groq
    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEY secret is not set on the server.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const groqResp = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: processingPrompt },
          { role: 'user', content: transcript },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    })

    const groqBody = await groqResp.json()
    if (!groqResp.ok) {
      throw new Error(groqBody.error?.message ?? `Groq API error ${groqResp.status}`)
    }

    const text: string = groqBody.choices?.[0]?.message?.content ?? ''

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
