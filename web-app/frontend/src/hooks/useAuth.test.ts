import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAuth } from './useAuth'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockAuthStateChange, mockGetSession, mockSignInWithPassword, mockSignOut, mockSignUp, mockSignInWithOAuth } = vi.hoisted(() => ({
  mockAuthStateChange: vi.fn(),
  mockGetSession: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      onAuthStateChange: mockAuthStateChange,
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
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
  // Always provide the subscription object so the hook can call unsubscribe on unmount
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

  it('should call signInWithOAuth with google provider and correct redirectTo', async () => {
    mockAuthSession(null)
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.signInWithGoogle()

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('should return the error when signIn fails', async () => {
    mockAuthSession(null)
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const response = await result.current.signIn('a@b.com', 'wrongpassword')

    expect(response.error).toEqual({ message: 'Invalid login credentials' })
  })

  it('should return the error when signUp fails', async () => {
    mockAuthSession(null)
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const response = await result.current.signUp('existing@example.com', 'password123')

    expect(response.error).toEqual({ message: 'User already registered' })
  })

  it('should set user to null when a SIGNED_OUT event fires after sign-in', async () => {
    let authCallback: (event: string, session: any) => void

    mockAuthStateChange.mockImplementation((callback: (event: string, session: any) => void) => {
      authCallback = callback
      callback('INITIAL_SESSION', { user: { id: 'user-123', email: 'test@example.com' } })
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.user).not.toBeNull())

    // Simulate Supabase firing a sign-out event
    act(() => { authCallback!('SIGNED_OUT', null) })

    await waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(result.current.loading).toBe(false)
    })
  })
})
