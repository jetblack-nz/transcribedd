import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '../test/utils/test-utils'
import { ProtectedRoute } from './ProtectedRoute'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockGetSession, mockAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
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
}

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => {
      mockNavigate(to)
      return <div>Redirecting to {to}</div>
    },
  }
})

describe('ProtectedRoute', () => {
  beforeEach(() => {
    resetAllMocks()
    mockNavigate.mockClear()
  })

  it('should show loading state initially', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('should render children when user is authenticated', async () => {
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('should redirect to /auth when user is not authenticated', async () => {
    mockAuthSession(null)

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    )

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth')
    })
  })

  it('renders the Navigate component pointing to /auth for unauthenticated users', async () => {
    mockAuthSession(null)

    render(
      <ProtectedRoute>
        <div>Content</div>
      </ProtectedRoute>
    )

    await waitFor(() => {
      expect(screen.getByText('Redirecting to /auth')).toBeInTheDocument()
    })
  })

  it('hides the loading spinner once auth resolves to authenticated', async () => {
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })

    render(
      <ProtectedRoute>
        <div>Protected</div>
      </ProtectedRoute>
    )

    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
      expect(screen.getByText('Protected')).toBeInTheDocument()
    })
  })
})
