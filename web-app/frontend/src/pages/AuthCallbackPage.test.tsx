import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '../test/utils/test-utils'
import { AuthCallbackPage } from './AuthCallbackPage'

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('shows "Completing sign in…" while exchange is in flight', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves
    render(<AuthCallbackPage />)
    expect(screen.getByText('Completing sign in…')).toBeInTheDocument()
  })

  it('navigates to / when session is returned', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123', email: 'test@example.com' } } },
      error: null,
    })
    render(<AuthCallbackPage />)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('navigates to /auth when session is null (e.g. code already consumed)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    render(<AuthCallbackPage />)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/auth', { replace: true })
    })
  })

  it('shows error message and does not navigate when exchange returns an error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid_grant: code has already been used' },
    })
    render(<AuthCallbackPage />)
    await waitFor(() => {
      expect(screen.getByText('Sign-in failed')).toBeInTheDocument()
      expect(screen.getByText('invalid_grant: code has already been used')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
