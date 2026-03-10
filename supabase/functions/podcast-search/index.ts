import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ITUNES_BASE = 'https://itunes.apple.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { q, feedId } = await req.json()

    let apiUrl: string
    if (feedId) {
      // Episodes lookup by iTunes collection ID
      apiUrl = `${ITUNES_BASE}/lookup?id=${encodeURIComponent(feedId)}&media=podcast&entity=podcastEpisode&limit=50`
    } else if (q) {
      apiUrl = `${ITUNES_BASE}/search?term=${encodeURIComponent(q)}&media=podcast&entity=podcast&limit=20`
    } else {
      return new Response(
        JSON.stringify({ error: 'q or feedId is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const response = await fetch(apiUrl, { headers: { 'User-Agent': 'transcribedd/1.0' } })
    const raw = await response.json()

    let data: unknown
    if (feedId) {
      // First result is the podcast itself; rest are episodes
      const episodes = (raw.results ?? []).filter(
        (r: Record<string, unknown>) => r.wrapperType === 'podcastEpisode',
      )
      data = {
        items: episodes.map((ep: Record<string, unknown>) => ({
          id: ep.trackId,
          title: ep.trackName,
          description: ep.description ?? null,
          datePublished: ep.releaseDate
            ? Math.floor(new Date(ep.releaseDate as string).getTime() / 1000)
            : 0,
          duration: ep.trackTimeMillis ? Math.floor(Number(ep.trackTimeMillis) / 1000) : 0,
          enclosureUrl: ep.episodeUrl ?? '',
        })),
      }
    } else {
      data = {
        feeds: (raw.results ?? []).map((f: Record<string, unknown>) => ({
          id: f.collectionId,
          title: f.collectionName,
          author: f.artistName ?? '',
          artwork: f.artworkUrl600 ?? f.artworkUrl100 ?? null,
          image: f.artworkUrl600 ?? f.artworkUrl100 ?? null,
          url: f.feedUrl ?? '',
          ownerName: f.artistName ?? '',
          description: null,
        })),
      }
    }

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

