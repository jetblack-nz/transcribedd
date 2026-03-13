import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from './useAuth'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockAuthStateChange, mockGetSession, mockSignInWithPassword, mockSignOut, mockSignUp } = vi.hoisted(() => ({
  mockAuthStateChange: vi.fn(),
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockSignUp: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockAuthStateChange,
      signUp: mockSignUp,
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

describe('useAuth', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useAuth())
    
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBe(null)
  })

  it('should set user when session exists', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    mockAuthSession(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toEqual(expect.objectContaining({
      id: mockUser.id,
      email: mockUser.email,
    }))
  })

  it('should set user to null when no session', async () => {
    mockAuthSession(null)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toBe(null)
  })

  it('should call signUp with email and password', async () => {
    mockAuthSession(null)
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.signUp('test@example.com', 'password123')

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('should call signIn with email and password', async () => {
    mockAuthSession(null)
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' },
        session: { access_token: 'token' },
      },
      error: null,
    })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.signIn('test@example.com', 'password123')

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('should call signOut', async () => {
    mockAuthSession({ id: 'user-123', email: 'test@example.com' })
    mockSignOut.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.signOut()

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('should subscribe to auth state changes', () => {
    mockAuthSession(null)

    renderHook(() => useAuth())

    expect(mockAuthStateChange).toHaveBeenCalled()
  })

  it('should unsubscribe on unmount', () => {
    mockAuthSession(null)
    const unsubscribeMock = vi.fn()
    mockAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    })

    const { unmount } = renderHook(() => useAuth())
    unmount()

    expect(unsubscribeMock).toHaveBeenCalled()
  })
})
