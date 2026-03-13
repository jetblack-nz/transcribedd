import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJobs } from './useJobs'
import { createMockJobs, createMockJob } from '../test/mocks/data'

// Use vi.hoisted() to declare mocks that will be available in the factory
const { mockSelect, mockInsert, mockEq, mockOrder, mockFrom, mockChannel, mockSupabaseFrom, mockRemoveChannel } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockEq = vi.fn()
  const mockOrder = vi.fn()
  const mockFrom = vi.fn()
  const mockChannel = vi.fn()
  const mockRemoveChannel = vi.fn()
  return { mockSelect, mockInsert, mockEq, mockOrder, mockFrom, mockChannel, mockSupabaseFrom: mockFrom, mockRemoveChannel }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}))

function resetAllMocks() {
  vi.clearAllMocks()
  mockChannel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  })
}

describe('useJobs', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('should not fetch jobs when userId is undefined', () => {
    renderHook(() => useJobs(undefined))
    
    expect(mockSupabaseFrom).not.toHaveBeenCalled()
  })

  it('should fetch jobs when userId is provided', async () => {
    const mockJobs = createMockJobs(3)
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: mockJobs,
          error: null,
        })),
      })),
    })

    const { result } = renderHook(() => useJobs('user-123'))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.jobs).toEqual(mockJobs)
    expect(result.current.error).toBe(null)
  })

  it('should handle fetch error', async () => {
    const errorMessage = 'Failed to fetch jobs'
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: null,
          error: { message: errorMessage },
        })),
      })),
    })

    const { result } = renderHook(() => useJobs('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe(errorMessage)
    expect(result.current.jobs).toEqual([])
  })

  it('should create a job', async () => {
    const newJob = createMockJob({ id: 'new-job' })
    mockSupabaseFrom
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      })
      .mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: newJob,
              error: null,
            })),
          })),
        })),
      })

    const { result } = renderHook(() => useJobs('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const job = await result.current.createJob({
      podcast_title: 'Test Podcast',
      episode_title: 'Test Episode',
      episode_url: 'https://example.com/episode.mp3',
    })

    expect(job).toEqual(newJob)
    expect(mockSupabaseFrom).toHaveBeenCalledWith('jobs')
  })

  it('should throw error when createJob fails', async () => {
    mockSupabaseFrom
      .mockReturnValueOnce({
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({
            data: [],
            error: null,
          })),
        })),
      })
      .mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Insert failed' },
            })),
          })),
        })),
      })

    const { result } = renderHook(() => useJobs('user-123'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await expect(result.current.createJob({
      podcast_title: 'Test Podcast',
      episode_title: 'Test Episode',
      episode_url: 'https://example.com/episode.mp3',
    })).rejects.toEqual({ message: 'Insert failed' })
  })

  it('should subscribe to realtime changes', () => {
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      })),
    })

    renderHook(() => useJobs('user-123'))

    expect(mockChannel).toHaveBeenCalledWith('jobs-realtime')
  })

  it('should unsubscribe on unmount', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [],
          error: null,
        })),
      })),
    })

    const { unmount } = renderHook(() => useJobs('user-123'))

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled()
    })

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
