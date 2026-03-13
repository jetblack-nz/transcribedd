import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { DashboardPage } from './DashboardPage'
import { createMockJobs, createMockJob } from '../test/mocks/data'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockGetSession, mockAuthStateChange, mockFrom, mockChannel, mockInvoke } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockAuthStateChange: vi.fn(),
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
  mockInvoke: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockAuthStateChange,
    },
    from: mockFrom,
    channel: mockChannel,
    removeChannel: vi.fn(),
    functions: {
      invoke: mockInvoke,
    },
  },
}))

function mockAuthSession(user: any) {
  mockAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
    callback('INITIAL_SESSION', user ? { user } : null)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
}

function resetAllMocks() {
  vi.clearAllMocks()
  mockAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  mockChannel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })
}

// Helper: returns a mockImplementation for supabase.from() that handles both
// the jobs query (select+order) and the profiles query (select+eq+single).
function makeFromMock(jobsData: unknown[], jobsError: unknown = null) {
  return (table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { processing_prompt: null }, error: null })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      }
    }
    return {
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: jobsData, error: jobsError })),
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    }
  }
}

// Mock fetch for transcript download
const originalFetch = global.fetch
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  global.fetch = vi.fn() as any
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})
  global.fetch = vi.fn() as any
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
  
describe('DashboardPage', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })
  })

  it('should show loading state initially', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return makeFromMock([])(table)
      return { select: vi.fn(() => ({ order: vi.fn(() => new Promise(() => {})) })) }
    })

    render(<DashboardPage />)

    expect(screen.getByText('Loading jobs…')).toBeInTheDocument()
  })

  it('should display jobs list when loaded', async () => {
    const jobs = createMockJobs(3)
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Episode 1')).toBeInTheDocument()
      expect(screen.getByText('Episode 2')).toBeInTheDocument()
      expect(screen.getByText('Episode 3')).toBeInTheDocument()
    })
  })

  it('should display empty state when no jobs', async () => {
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('No jobs yet')).toBeInTheDocument()
      expect(screen.getByText(/search for a podcast/i)).toBeInTheDocument()
    })
  })

  it('should display job counts', async () => {
    const jobs = [
      createMockJob({ id: '1', status: 'completed' }),
      createMockJob({ id: '2', status: 'processing' }),
      createMockJob({ id: '3', status: 'pending' }),
      createMockJob({ id: '4', status: 'completed' }),
    ]
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/2 in progress/)).toBeInTheDocument()
      expect(screen.getByText(/2 completed/)).toBeInTheDocument()
    })
  })

  it('should display error when fetch fails', async () => {
    mockFrom.mockImplementation(makeFromMock([], { message: 'Database error' }))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Database error')).toBeInTheDocument()
    })
  })

  it('should handle transcript download', async () => {
    const jobs = [
      createMockJob({
        id: 'job-1',
        status: 'completed',
        transcript_path: 'transcripts/test.txt',
        episode_title: 'Test Episode',
      }),
    ]
    mockFrom.mockImplementation(makeFromMock(jobs))
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-token',
          user: { id: 'user-123', email: 'test@example.com' },
        },
      },
      error: null,
    })

    // Mock the transcript URL endpoint
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: 'https://example.com/transcript.txt' }),
    })

    // Mock the file download
    ;(global.fetch as any).mockResolvedValueOnce({
      text: () => Promise.resolve('transcript content'),
    })

    const user = userEvent.setup()
    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download (text)' })).toBeInTheDocument()
    })

    const originalCreateElement = document.createElement.bind(document)
    const clickSpy = vi.fn()
    document.createElement = vi.fn().mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: clickSpy }
      return originalCreateElement(tag)
    })

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/get-transcript-url'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      )
    })
    document.createElement = originalCreateElement
  })

  it('should have New job link', async () => {
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => {
      const newJobLink = screen.getByRole('link', { name: /new job/i })
      expect(newJobLink).toBeInTheDocument()
      expect(newJobLink).toHaveAttribute('href', '/search')
    })
  })
})
