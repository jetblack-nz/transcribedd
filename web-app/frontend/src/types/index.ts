export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Job {
  id: string
  user_id: string
  podcast_title: string
  episode_title: string
  episode_url: string
  audio_file_url: string | null
  status: JobStatus
  transcript_path: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  worker_id: string | null
  error_message: string | null
}

export interface Profile {
  id: string
  email: string
  subscription: string
  jobs_completed: number
  created_at: string
}

export interface PodcastResult {
  id: string
  title: string
  author: string
  artworkUrl: string | null
  feedUrl: string
  description: string | null
}

export interface EpisodeResult {
  id: string
  title: string
  description: string | null
  datePublished: number
  duration: number
  enclosureUrl: string
  feedTitle: string
}
