import { useState, useRef, useEffect } from 'react'
import type { Job } from '../types'

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

interface JobCardProps {
  job: Job
  onDownload: (job: Job) => Promise<void>
  onDownloadDeluxe: (job: Job) => Promise<void>
  onDelete: (job: Job) => Promise<void>
  hasPrompt: boolean
}

export function JobCard({ job, onDownload, onDownloadDeluxe, onDelete, hasPrompt }: JobCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const date = new Date(job.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleDelete = async () => {
    setMenuOpen(false)
    setDeleting(true)
    try {
      await onDelete(job)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-gray-300 transition-colors ${deleting ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{job.episode_title}</p>
          <p className="text-xs text-gray-400 truncate">{job.podcast_title} · {date}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLASSES[job.status]}`}>
          {job.status}
        </span>
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={deleting}
            aria-label="Job options"
            className="text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-40 text-base leading-none"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
              {job.status === 'completed' && (
                <>
                  <button
                    onClick={() => { setMenuOpen(false); void onDownload(job) }}
                    className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    Download (text)
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); void onDownloadDeluxe(job) }}
                    disabled={!hasPrompt}
                    title={hasPrompt ? 'Process with your AI prompt and download as Word doc' : 'Set a processing prompt in settings first'}
                    className="w-full text-left text-sm px-4 py-2 hover:bg-gray-50 text-gray-700 disabled:opacity-40"
                  >
                    Download (docx)
                  </button>
                  <hr className="my-1 border-gray-100" />
                </>
              )}
              <button
                onClick={handleDelete}
                className="w-full text-left text-sm px-4 py-2 hover:bg-red-50 text-red-600"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {job.status === 'processing' && (
        <div className="mt-2 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full animate-pulse w-2/3" />
        </div>
      )}
      {job.error_message && (
        <p className="text-xs text-red-600 mt-1 truncate" title={job.error_message}>
          {job.error_message}
        </p>
      )}
    </div>
  )
}
