import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const PODCAST_INDEX_KEY = Deno.env.get('PODCAST_INDEX_KEY') ?? ''
const PODCAST_INDEX_SECRET = Deno.env.get('PODCAST_INDEX_SECRET') ?? ''
const BASE_URL = 'https://api.podcastindex.org/api/1.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const apiHeaderTime = Math.floor(Date.now() / 1000).toString()
  const message = PODCAST_INDEX_KEY + PODCAST_INDEX_SECRET + apiHeaderTime

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PODCAST_INDEX_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  const hash = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return {
    'User-Agent': 'transcribedd/1.0',
    'X-Auth-Key': PODCAST_INDEX_KEY,
    'X-Auth-Date': apiHeaderTime,
    Authorization: hash,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (!PODCAST_INDEX_KEY || !PODCAST_INDEX_SECRET) {
      return new Response(
        JSON.stringify({ error: 'PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET secrets are not set' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const { q, feedId } = await req.json()

    let apiUrl: string
    if (feedId) {
      apiUrl = `${BASE_URL}/episodes/byfeedid?id=${encodeURIComponent(feedId)}&max=30&pretty`
    } else if (q) {
      apiUrl = `${BASE_URL}/search/byterm?q=${encodeURIComponent(q)}&max=20&pretty`
    } else {
      return new Response(
        JSON.stringify({ error: 'q or feedId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const headers = await buildAuthHeaders()
    const response = await fetch(apiUrl, { headers })
    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
})
