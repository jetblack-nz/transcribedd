import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useJobs } from '../hooks/useJobs'
import { JobCard } from '../components/JobCard'
import { supabase } from '../lib/supabase'
import type { Job } from '../types'

export function DashboardPage() {
  const { user } = useAuth()
  const { jobs, loading, error } = useJobs(user?.id)
  const [workerToken, setWorkerToken] = useState<string | null>(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const handleDownload = async (job: Job) => {
    if (!job.transcript_path) return
    try {
      const { data, error } = await supabase.functions.invoke('get-transcript-url', {
        body: { path: job.transcript_path },
      })
      if (error) throw error
      if (data?.url) window.open(data.url, '_blank')
    } catch {
      alert('Could not generate download link. Please try again.')
    }
  }

  const handleGenerateWorkerToken = async () => {
    setGeneratingToken(true)
    setTokenError(null)
    setWorkerToken(null)
    try {
      const { data, error } = await supabase.functions.invoke('create-worker-token', {})
      if (error) throw error
      setWorkerToken(data.token)
    } catch (err: unknown) {
      setTokenError(err instanceof Error ? err.message : 'Failed to generate token')
    } finally {
      setGeneratingToken(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading jobs…</p>
  }

  const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length
  const completedCount = jobs.filter((j) => j.status === 'completed').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
          {jobs.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {pendingCount > 0 ? `${pendingCount} in progress · ` : ''}
              {completedCount} completed
            </p>
          )}
        </div>
        <Link
          to="/search"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New job
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-4">🎙️</p>
          <p className="text-lg font-medium text-gray-600 mb-1">No jobs yet</p>
          <p className="text-sm">
            <Link to="/search" className="text-gray-900 underline underline-offset-2">
              Search for a podcast
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onDownload={handleDownload} />
          ))}
        </div>
      )}

      {/* Worker Token section */}
      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-base font-semibold text-gray-900 mb-1">macOS Worker Token</h2>
        <p className="text-sm text-gray-500 mb-4">
          Generate a token for the macOS worker app. The raw token is shown only once — store it
          in the app when prompted.
        </p>

        {workerToken ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">
              Your worker token (copy now — shown once)
            </p>
            <code className="block text-sm font-mono text-gray-900 break-all select-all">
              {workerToken}
            </code>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleGenerateWorkerToken}
              disabled={generatingToken}
              className="bg-white border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {generatingToken ? 'Generating…' : 'Generate worker token'}
            </button>
            {tokenError && <p className="text-sm text-red-600">{tokenError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
