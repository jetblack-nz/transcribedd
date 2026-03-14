import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { SearchPage } from './SearchPage'

const { mockAuthStateChange, mockInvoke, mockFrom, mockChannel } = vi.hoisted(() => ({
  mockAuthStateChange: vi.fn(),
  mockInvoke: vi.fn(),
  mockFrom: vi.fn(),
  mockChannel: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: mockAuthStateChange },
    from: mockFrom,
    channel: mockChannel,
    removeChannel: vi.fn(),
    functions: { invoke: mockInvoke },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockNavigate = vi.fn()

function resetAllMocks() {
  vi.clearAllMocks()
  mockNavigate.mockClear()
  mockAuthStateChange.mockImplementation((callback: (event: string, session: unknown) => void) => {
    callback('INITIAL_SESSION', { user: { id: 'user-123', email: 'test@example.com' } })
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockChannel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
    })),
  })
  mockInvoke.mockResolvedValue({ data: null, error: null })
  vi.spyOn(window, 'alert').mockImplementation(() => {})
}

const rawFeeds = [
  { id: '1', title: 'The Test Podcast', author: 'Test Author', artwork: 'https://example.com/art.jpg', url: 'https://example.com/feed.xml', description: 'A test podcast' },
  { id: '2', title: 'Another Podcast', author: 'Another Author', artwork: null, url: 'https://example.com/feed2.xml', description: null },
]

const rawItems = [
  { id: '1', title: 'Episode 1', description: 'First', datePublished: 1704067200, duration: 3600, enclosureUrl: 'https://example.com/ep1.mp3' },
  { id: '2', title: 'Episode 2', description: null, datePublished: 1703980800, duration: 2400, enclosureUrl: 'https://example.com/ep2.mp3' },
]

describe('SearchPage', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  // --- Rendering ---

  it('renders the "Search Podcasts" heading and search input', () => {
    render(<SearchPage />)
    expect(screen.getByText('Search Podcasts')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search for a podcast…')).toBeInTheDocument()
  })

  it('Search button is disabled when query is empty', () => {
    render(<SearchPage />)
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('Search button is enabled after typing in the input', async () => {
    const user = userEvent.setup()
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    expect(screen.getByRole('button', { name: 'Search' })).not.toBeDisabled()
  })

  // --- Search flow ---

  it('calls podcast-search edge function with trimmed query on submit', async () => {
    const user = userEvent.setup()
    mockInvoke.mockResolvedValue({ data: { feeds: [] }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), '  hello  ')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('podcast-search', { body: { q: 'hello' } }))
  })

  it('shows "Searching…" on the button while search is in flight', async () => {
    const user = userEvent.setup()
    mockInvoke.mockReturnValue(new Promise(() => {})) // never resolves
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Searching…' })).toBeInTheDocument())
  })

  it('renders podcast cards after a successful search', async () => {
    const user = userEvent.setup()
    mockInvoke.mockResolvedValue({ data: { feeds: rawFeeds }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(screen.getByText('The Test Podcast')).toBeInTheDocument()
      expect(screen.getByText('Another Podcast')).toBeInTheDocument()
    })
  })

  it('renders a grey placeholder div when podcast artworkUrl is null', async () => {
    const user = userEvent.setup()
    mockInvoke.mockResolvedValue({ data: { feeds: rawFeeds }, error: null })
    const { container } = render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('Another Podcast'))
    expect(container.querySelector('.bg-gray-100')).toBeInTheDocument()
  })

  it('shows "No podcasts found" error when feeds array is empty', async () => {
    const user = userEvent.setup()
    mockInvoke.mockResolvedValue({ data: { feeds: [] }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'xyz')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByText('No podcasts found. Try a different search.')).toBeInTheDocument())
  })

  it('shows generic error string when invoke throws a plain Error', async () => {
    const user = userEvent.setup()
    mockInvoke.mockRejectedValue(new Error('Network failure'))
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByText('Network failure')).toBeInTheDocument())
  })

  it('does not call invoke when query is only whitespace', async () => {
    const user = userEvent.setup()
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), '   ')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  // --- Podcast selection / episode flow ---

  it('calls podcast-search with feedId when a podcast card is clicked', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: [] }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('podcast-search', { body: { feedId: '1' } })
    )
  })

  it('shows "Loading episodes…" while episode fetch is in flight', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockReturnValueOnce(new Promise(() => {}))
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => expect(screen.getByText('Loading episodes…')).toBeInTheDocument())
  })

  it('renders episode list after a podcast is selected', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => {
      expect(screen.getByText('Episode 1')).toBeInTheDocument()
      expect(screen.getByText('Episode 2')).toBeInTheDocument()
    })
  })

  it('hides the podcast list once a podcast is selected', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('Another Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('Episode 1'))
    expect(screen.queryByText('Another Podcast')).not.toBeInTheDocument()
  })

  it('shows "No episodes found." when items array is empty', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: [] }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => expect(screen.getByText('No episodes found.')).toBeInTheDocument())
  })

  it('clicking "← Back" clears the selected podcast and shows the podcast list again', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('← Back'))
    await user.click(screen.getByText('← Back'))
    await waitFor(() => {
      expect(screen.getByText('The Test Podcast')).toBeInTheDocument()
      expect(screen.getByText('Another Podcast')).toBeInTheDocument()
    })
  })

  it('clicking "← Back" clears the search error banner', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockRejectedValueOnce(new Error('Episode load failed'))
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('Episode load failed'))
    await user.click(screen.getByText('← Back'))
    await waitFor(() => expect(screen.queryByText('Episode load failed')).not.toBeInTheDocument())
  })

  // --- Job creation ---

  it('calls createJob with correct fields when Transcribe is clicked', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'new-job' }, error: null })) })),
          })),
        }
      }
      return { select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }
    })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('Episode 1'))
    await user.click(screen.getAllByRole('button', { name: 'Transcribe' })[0])
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('shows "Adding…" and disables the button while creating a job', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: vi.fn(() => new Promise(() => {})) })), // never resolves
          })),
        }
      }
      return { select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }
    })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('Episode 1'))
    await user.click(screen.getAllByRole('button', { name: 'Transcribe' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled())
  })

  it('navigates to "/" after successful job creation', async () => {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items: rawItems }, error: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'jobs') {
        return {
          select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'new-job' }, error: null })) })),
          })),
        }
      }
      return { select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }
    })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText('Episode 1'))
    await user.click(screen.getAllByRole('button', { name: 'Transcribe' })[0])
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  // --- formatDuration (via rendered episode metadata) ---

  async function renderEpisodes(items: typeof rawItems) {
    const user = userEvent.setup()
    mockInvoke
      .mockResolvedValueOnce({ data: { feeds: rawFeeds }, error: null })
      .mockResolvedValueOnce({ data: { items }, error: null })
    render(<SearchPage />)
    await user.type(screen.getByPlaceholderText('Search for a podcast…'), 'test')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => screen.getByText('The Test Podcast'))
    await user.click(screen.getByText('The Test Podcast'))
    await waitFor(() => screen.getByText(items[0].title))
  }

  it('shows nothing for duration 0', async () => {
    await renderEpisodes([{ ...rawItems[0], duration: 0 }])
    expect(screen.queryByText(/· /)).not.toBeInTheDocument()
  })

  it('shows "Xs" format for seconds-only duration', async () => {
    await renderEpisodes([{ ...rawItems[0], duration: 45 }])
    expect(screen.getByText(/· 45s/)).toBeInTheDocument()
  })

  it('shows "Xm Ys" format for minutes + seconds', async () => {
    await renderEpisodes([{ ...rawItems[0], duration: 150 }])
    expect(screen.getByText(/· 2m 30s/)).toBeInTheDocument()
  })

  it('shows "Xh Ym" format for hours, omitting seconds', async () => {
    await renderEpisodes([{ ...rawItems[0], duration: 3660 }])
    expect(screen.getByText(/· 1h 1m/)).toBeInTheDocument()
  })
})
