import type { Job } from '../types'

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

interface JobCardProps {
  job: Job
  onDownload: (job: Job) => void
}

export function JobCard({ job, onDownload }: JobCardProps) {
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
            <button
              onClick={() => onDownload(job)}
              className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors"
            >
              Download
            </button>
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
