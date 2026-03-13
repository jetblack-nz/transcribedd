import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { Layout } from './Layout'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockGetSession, mockSignOut, mockAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSignOut: vi.fn(),
  mockAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
      onAuthStateChange: mockAuthStateChange,
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
  mockSignOut.mockResolvedValue({ error: null })
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Layout', () => {
  beforeEach(() => {
    resetAllMocks()
    mockNavigate.mockClear()
    mockSignOut.mockResolvedValue({ error: null })
  })

  it('should render children', async () => {
    mockAuthSession(null)

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })
  })

  it('should render Transcribedd title', async () => {
    mockAuthSession(null)

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.getByText('Transcribedd')).toBeInTheDocument()
    })
  })

  it('should not render nav links when user is not authenticated', async () => {
    mockAuthSession(null)

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.queryByText('Jobs')).not.toBeInTheDocument()
      expect(screen.queryByText('Search')).not.toBeInTheDocument()
      expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
    })
  })

  it('should render nav links when user is authenticated', async () => {
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeInTheDocument()
      expect(screen.getByText('Search')).toBeInTheDocument()
      expect(screen.getByText('Sign out')).toBeInTheDocument()
    })
  })

  it('should navigate to home when Transcribedd title is clicked', async () => {
    const user = userEvent.setup()
    mockAuthSession(null)

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.getByText('Transcribedd')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Transcribedd'))
    
    // The link should have the correct href
    expect(screen.getByText('Transcribedd').closest('a')).toHaveAttribute('href', '/')
  })

  it('should call signOut and navigate to /auth when sign out button is clicked', async () => {
    const user = userEvent.setup()
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })

    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    )

    await waitFor(() => {
      expect(screen.getByText('Sign out')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Sign out'))

    expect(mockSignOut).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/auth')
  })
})
