import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

vi.mock('docx', () => ({
  Document: vi.fn(),
  Packer: { toBlob: vi.fn().mockResolvedValue(new Blob(['docx content'])) },
  Paragraph: vi.fn(),
  HeadingLevel: { HEADING_1: 'HEADING_1', HEADING_2: 'HEADING_2', HEADING_3: 'HEADING_3' },
  TextRun: vi.fn(),
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

  afterEach(() => {
    vi.useRealTimers()
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

  // --- Prompt section ---

  it('renders the prompt textarea after promptLoading resolves', async () => {
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('loads the saved prompt from the profiles table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { processing_prompt: 'My custom prompt' }, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
        }
      }
      return makeFromMock([])(table)
    })

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('My custom prompt')
    })
  })

  it('falls back to the default prompt when profiles returns null processing_prompt', async () => {
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => {
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      expect(textarea.value).toContain('transcript formatter')
    })
  })

  it('updates the textarea value as the user types', async () => {
    const user = userEvent.setup()
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('textbox'))

    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'New prompt text')

    expect(textarea).toHaveValue('New prompt text')
  })

  it('shows "Saving…" on the Save button while saving', async () => {
    const user = userEvent.setup()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { processing_prompt: null }, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(() => new Promise(() => {})) })), // never resolves
        }
      }
      return makeFromMock([])(table)
    })

    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Save prompt' }))
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument())
  })

  it('shows "Saved ✓" after a successful save', async () => {
    const user = userEvent.setup()
    mockFrom.mockImplementation(makeFromMock([]))

    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Save prompt' }))
    await user.click(screen.getByRole('button', { name: 'Save prompt' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeInTheDocument())
  })

  it('resets Save button label back to "Save prompt" after 2 seconds', async () => {
    const user = userEvent.setup()
    mockFrom.mockImplementation(makeFromMock([]))
    render(<DashboardPage />)
    await waitFor(() => screen.getByRole('button', { name: 'Save prompt' }))

    await user.click(screen.getByRole('button', { name: 'Save prompt' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeInTheDocument())

    // Wait for the real 2-second reset timer
    await new Promise<void>(resolve => { setTimeout(resolve, 2100) })
    expect(screen.getByRole('button', { name: 'Save prompt' })).toBeInTheDocument()
  }, 10000)

  // --- Docx download ---

  it('calls process-transcript with auth token when Download (docx) is clicked', async () => {
    const jobs = [createMockJob({ id: 'job-1', status: 'completed', transcript_path: 'path/to/file.txt', episode_title: 'Test Episode' })]
    mockFrom.mockImplementation(makeFromMock(jobs))
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: { id: 'user-123', email: 'test@example.com' } } },
      error: null,
    })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'transcript content' }),
    })

    const user = userEvent.setup()
    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Save prompt' }))

    const originalCreateElement = document.createElement.bind(document)
    document.createElement = vi.fn().mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: vi.fn() }
      return originalCreateElement(tag)
    })

    await waitFor(() => screen.getByRole('button', { name: 'Download (docx)' }))
    await user.click(screen.getByRole('button', { name: 'Download (docx)' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/process-transcript'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
        }),
      )
    )

    document.createElement = originalCreateElement
  })

  it('disables the Download (docx) button when the prompt textarea is empty', async () => {
    const user = userEvent.setup()
    const jobs = [createMockJob({ id: 'job-1', status: 'completed', transcript_path: 'path/to/file.txt' })]
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Download (docx)' }))

    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Download (docx)' })).toBeDisabled()
    )
  })

  // --- Text download edge cases ---

  it('shows alert when getSession returns no session', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const jobs = [createMockJob({ id: 'job-1', status: 'completed', transcript_path: 'path/to/file.txt', episode_title: 'Test Episode' })]
    mockFrom.mockImplementation(makeFromMock(jobs))
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    const user = userEvent.setup()
    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Download (text)' }))
    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Not authenticated')))
    alertSpy.mockRestore()
  })

  it('shows alert when get-transcript-url returns a non-ok response', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const jobs = [createMockJob({ id: 'job-1', status: 'completed', transcript_path: 'path/to/file.txt', episode_title: 'Test' })]
    mockFrom.mockImplementation(makeFromMock(jobs))
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: { id: 'user-123' } } },
      error: null,
    })
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const user = userEvent.setup()
    render(<DashboardPage />)

    await waitFor(() => screen.getByRole('button', { name: 'Download (text)' }))
    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    await waitFor(() => expect(alertSpy).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  // --- Timing notice ---

  it('shows timing notice banner when a job is pending', async () => {
    const jobs = [createMockJob({ id: '1', status: 'pending' })]
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText(/Long podcasts can take up to 10 minutes/)).toBeInTheDocument()
    })
  })

  it('does not show timing notice when all jobs are completed', async () => {
    const jobs = [createMockJob({ id: '1', status: 'completed' })]
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => screen.getByText('Test Episode'))
    expect(screen.queryByText(/Long podcasts can take up to 10 minutes/)).not.toBeInTheDocument()
  })

  // --- Job counts ---

  it('shows only the completed count when no jobs are in progress', async () => {
    const jobs = [
      createMockJob({ id: '1', status: 'completed' }),
      createMockJob({ id: '2', status: 'completed' }),
    ]
    mockFrom.mockImplementation(makeFromMock(jobs))

    render(<DashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('2 completed')).toBeInTheDocument()
      expect(screen.queryByText(/in progress/)).not.toBeInTheDocument()
    })
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
