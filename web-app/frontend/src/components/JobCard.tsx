import { useState } from 'react'
import type { Job } from '../types'

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

type BtnState = 'idle' | 'loading' | 'done'

interface JobCardProps {
  job: Job
  onDownload: (job: Job) => Promise<void>
  onDownloadDeluxe: (job: Job) => Promise<void>
  hasPrompt: boolean
}

function DownloadButton({ label, onClick, disabled, title }: {
  label: string
  onClick: () => Promise<void>
  disabled?: boolean
  title?: string
}) {
  const [state, setState] = useState<BtnState>('idle')

  const handleClick = async () => {
    if (state !== 'idle') return
    setState('loading')
    try {
      await onClick()
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('idle')
    }
  }

  const icon = state === 'loading'
    ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
    : state === 'done'
    ? <span>✓</span>
    : null

  return (
    <button
      onClick={handleClick}
      disabled={disabled || state === 'loading'}
      title={title}
      className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
    >
      {icon}{label}
    </button>
  )
}

export function JobCard({ job, onDownload, onDownloadDeluxe, hasPrompt }: JobCardProps) {
  const date = new Date(job.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900 truncate">{job.episode_title}</p>
          <p className="text-sm text-gray-500 truncate mt-0.5">{job.podcast_title}</p>
          <p className="text-xs text-gray-400 mt-1">{date}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CLASSES[job.status]}`}>
            {job.status}
          </span>
          {job.status === 'completed' && (
            <>
              <DownloadButton
                label="Download (text)"
                onClick={() => onDownload(job)}
              />
              <DownloadButton
                label="Download (docx)"
                onClick={() => onDownloadDeluxe(job)}
                disabled={!hasPrompt}
                title={hasPrompt ? 'Process with your AI prompt and download as Word doc' : 'Set a processing prompt in settings first'}
              />
            </>
          )}
        </div>
      </div>
      {job.status === 'processing' && (
        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full animate-pulse w-2/3" />
        </div>
      )}
      {job.error_message && (
        <p className="text-xs text-red-600 mt-2 truncate" title={job.error_message}>
          {job.error_message}
        </p>
      )}
    </div>
  )
}
