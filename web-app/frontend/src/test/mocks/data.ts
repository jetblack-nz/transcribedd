import type { Job } from '../../types'

export function createMockJob(overrides?: Partial<Job>): Job {
  return {
    id: 'job-123',
    user_id: 'user-123',
    status: 'pending',
    podcast_title: 'Test Podcast',
    episode_title: 'Test Episode',
    episode_url: 'https://example.com/episode.mp3',
    audio_file_url: 'https://example.com/audio.mp3',
    transcript_path: null,
    worker_id: null,
    started_at: null,
    completed_at: null,
    error_message: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockJobs(count: number = 3): Job[] {
  return Array.from({ length: count }, (_, i) => createMockJob({
    id: `job-${i + 1}`,
    episode_title: `Episode ${i + 1}`,
    status: i === 0 ? 'completed' : i === 1 ? 'processing' : 'pending',
  }))
}

export const mockPodcastResults = [
  {
    id: '1',
    title: 'The Test Podcast',
    author: 'Test Author',
    artworkUrl: 'https://example.com/art.jpg',
    feedUrl: 'https://example.com/feed.xml',
    description: 'A test podcast',
  },
  {
    id: '2',
    title: 'Another Podcast',
    author: 'Another Author',
    artworkUrl: null,
    feedUrl: 'https://example.com/feed2.xml',
    description: null,
  },
]

export const mockEpisodeResults = [
  {
    id: '1',
    title: 'Episode 1',
    description: 'First episode',
    datePublished: 1704067200,
    duration: 3600,
    enclosureUrl: 'https://example.com/ep1.mp3',
    feedTitle: 'The Test Podcast',
  },
  {
    id: '2',
    title: 'Episode 2',
    description: null,
    datePublished: 1703980800,
    duration: 2400,
    enclosureUrl: 'https://example.com/ep2.mp3',
    feedTitle: 'The Test Podcast',
  },
]
