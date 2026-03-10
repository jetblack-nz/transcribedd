import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useJobs } from '../hooks/useJobs'
import { useAuth } from '../hooks/useAuth'
import type { PodcastResult, EpisodeResult } from '../types'

function formatDuration(seconds: number) {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function SearchPage() {
  const { user } = useAuth()
  const { createJob } = useJobs(user?.id)
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [podcasts, setPodcasts] = useState<PodcastResult[]>([])
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastResult | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)
  const [creating, setCreating] = useState<string | null>(null) // episode id being created
  const [searchError, setSearchError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearchError(null)
    setSelectedPodcast(null)
    setEpisodes([])
    setPodcasts([])

    try {
      const { data, error } = await supabase.functions.invoke('podcast-search', {
        body: { q: query.trim() },
      })
      if (error) throw error

      const feeds = data?.feeds ?? []
      setPodcasts(
        feeds.map((f: Record<string, unknown>) => ({
          id: String(f.id),
          title: String(f.title ?? ''),
          author: String(f.author ?? f.ownerName ?? ''),
          artworkUrl: (f.artwork || f.image) as string | null,
          feedUrl: String(f.url ?? ''),
          description: (f.description as string | null) ?? null,
        }))
      )

      if (feeds.length === 0) setSearchError('No podcasts found. Try a different search.')
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'context' in err) {
        const ctx = (err as { context: Response }).context
        const body = await ctx.text().catch(() => '')
        setSearchError(`HTTP ${ctx.status}: ${body || (err instanceof Error ? err.message : 'Search failed')}`)
      } else {
        setSearchError(err instanceof Error ? err.message : 'Search failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPodcast = async (podcast: PodcastResult) => {
    setSelectedPodcast(podcast)
    setEpisodes([])
    setLoadingEpisodes(true)

    try {
      const { data, error } = await supabase.functions.invoke('podcast-search', {
        body: { feedId: podcast.id },
      })
      if (error) throw error

      const items = data?.items ?? []
      setEpisodes(
        items.map((ep: Record<string, unknown>) => ({
          id: String(ep.id),
          title: String(ep.title ?? ''),
          description: (ep.description as string | null) ?? null,
          datePublished: Number(ep.datePublished ?? 0),
          duration: Number(ep.duration ?? 0),
          enclosureUrl: String(ep.enclosureUrl ?? ''),
          feedTitle: podcast.title,
        })).sort((a: EpisodeResult, b: EpisodeResult) => b.datePublished - a.datePublished)
      )
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load episodes')
    } finally {
      setLoadingEpisodes(false)
    }
  }

  const handleCreateJob = async (episode: EpisodeResult) => {
    if (!episode.enclosureUrl) {
      alert('No audio URL for this episode.')
      return
    }
    setCreating(episode.id)
    try {
      await createJob({
        podcast_title: selectedPodcast!.title,
        episode_title: episode.title,
        episode_url: episode.enclosureUrl,
        audio_file_url: episode.enclosureUrl,
      })
      navigate('/')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create job')
      setCreating(null)
    }
  }

  const handleBack = () => {
    setSelectedPodcast(null)
    setEpisodes([])
    setSearchError(null)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search Podcasts</h1>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-8">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a podcast…"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {searchError && (
        <p className="text-sm text-red-600 mb-4">{searchError}</p>
      )}

      {/* Episode list */}
      {selectedPodcast && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              {selectedPodcast.artworkUrl && (
                <img
                  src={selectedPodcast.artworkUrl}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover"
                />
              )}
              <div>
                <p className="font-medium text-gray-900 text-sm">{selectedPodcast.title}</p>
                {selectedPodcast.author && (
                  <p className="text-xs text-gray-500">{selectedPodcast.author}</p>
                )}
              </div>
            </div>
          </div>

          {loadingEpisodes ? (
            <p className="text-sm text-gray-400">Loading episodes…</p>
          ) : episodes.length === 0 ? (
            <p className="text-sm text-gray-400">No episodes found.</p>
          ) : (
            <div className="space-y-2">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 flex items-start justify-between gap-4 hover:border-gray-300 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm leading-snug">{ep.title}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(ep.datePublished)}
                      {ep.duration > 0 && ` · ${formatDuration(ep.duration)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCreateJob(ep)}
                    disabled={creating === ep.id}
                    className="shrink-0 text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating === ep.id ? 'Adding…' : 'Transcribe'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Podcast list */}
      {!selectedPodcast && podcasts.length > 0 && (
        <div className="space-y-2">
          {podcasts.map((podcast) => (
            <button
              key={podcast.id}
              onClick={() => handleSelectPodcast(podcast)}
              className="w-full bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4 hover:border-gray-300 transition-colors text-left"
            >
              {podcast.artworkUrl ? (
                <img
                  src={podcast.artworkUrl}
                  alt=""
                  className="w-12 h-12 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-md bg-gray-100 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 text-sm truncate">{podcast.title}</p>
                {podcast.author && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{podcast.author}</p>
                )}
              </div>
              <span className="text-gray-400 text-sm shrink-0">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
