import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { AuthPage } from './AuthPage'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockSignInWithPassword, mockSignInWithOAuth, mockGetSession, mockAuthStateChange } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignInWithOAuth: vi.fn(),
  mockGetSession: vi.fn(),
  mockAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
      getSession: mockGetSession,
      onAuthStateChange: mockAuthStateChange,
    },
  },
}))

function resetAllMocks() {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  mockAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('AuthPage', () => {
  beforeEach(() => {
    resetAllMocks()
    mockNavigate.mockClear()
  })

  it('should render sign in form', async () => {
    render(<AuthPage />)

    await waitFor(() => {
      expect(screen.getByText('Transcribedd')).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
  })

  it('should update email and password fields', async () => {
    const user = userEvent.setup()
    render(<AuthPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')

    expect(emailInput).toHaveValue('test@example.com')
    expect(passwordInput).toHaveValue('password123')
  })

  it('should call signIn and navigate on successful login', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-123', email: 'test@example.com' },
        session: { access_token: 'token' },
      },
      error: null,
    })

    render(<AuthPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: 'Sign in' })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('should display error message on failed login', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid credentials' },
    })

    render(<AuthPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: 'Sign in' })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'wrongpassword')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    render(<AuthPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: 'Sign in' })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    expect(submitButton).toBeDisabled()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders the "Sign in with Google" button', () => {
    render(<AuthPage />)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('calls signInWithGoogle when the Google button is clicked', async () => {
    const user = userEvent.setup()
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null })
    render(<AuthPage />)
    await user.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(mockSignInWithOAuth).toHaveBeenCalled()
  })

  it('renders the "Access by invitation only." caption', () => {
    render(<AuthPage />)
    expect(screen.getByText('Access by invitation only.')).toBeInTheDocument()
  })

  it('handles a thrown plain-object error by showing its message property', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Plain object error' },
    })
    render(<AuthPage />)
    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText('Plain object error')).toBeInTheDocument())
  })

  it('should clear error when submitting again', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword
      .mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'user-123', email: 'test@example.com' },
          session: { access_token: 'token' },
        },
        error: null,
      })

    render(<AuthPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: 'Sign in' })

    // First attempt - fail
    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'wrong')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    // Second attempt - success
    await user.clear(passwordInput)
    await user.type(passwordInput, 'correct')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
    })
  })
})
