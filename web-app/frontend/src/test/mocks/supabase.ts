import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export const mockSupabaseAuth = {
  getSession: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
}

export const mockSupabaseFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    order: vi.fn(() => ({
      data: [],
      error: null,
    })),
    single: vi.fn(() => ({
      data: null,
      error: null,
    })),
  })),
  insert: vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => ({
        data: null,
        error: null,
      })),
    })),
  })),
  update: vi.fn(() => ({
    eq: vi.fn(() => ({
      data: null,
      error: null,
    })),
  })),
  delete: vi.fn(() => ({
    eq: vi.fn(() => ({
      data: null,
      error: null,
    })),
  })),
}))

export const mockSupabaseChannel = {
  on: vi.fn(() => mockSupabaseChannel),
  subscribe: vi.fn(() => mockSupabaseChannel),
  unsubscribe: vi.fn(),
}

export const mockSupabase = {
  auth: mockSupabaseAuth,
  from: mockSupabaseFrom,
  channel: vi.fn(() => mockSupabaseChannel),
  removeChannel: vi.fn(),
  functions: {
    invoke: vi.fn(() => ({
      data: null,
      error: null,
    })),
  },
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(() => ({
        data: { signedUrl: 'https://example.com/signed-url' },
        error: null,
      })),
    })),
  },
} as unknown as SupabaseClient

export function resetAllMocks() {
  vi.clearAllMocks()
}

export function mockAuthSession(user: { id: string; email: string } | null) {
  mockSupabaseAuth.getSession.mockResolvedValue({
    data: {
      session: user
        ? {
            user: { id: user.id, email: user.email },
            access_token: 'mock-token',
          }
        : null,
    },
    error: null,
  })
}
