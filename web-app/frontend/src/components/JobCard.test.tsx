import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { JobCard } from './JobCard'
import { createMockJob } from '../test/mocks/data'

describe('JobCard', () => {
  it('should render job details', () => {
    const job = createMockJob({
      podcast_title: 'My Podcast',
      episode_title: 'Episode 1',
      status: 'pending',
    })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    expect(screen.getByText('Episode 1')).toBeInTheDocument()
    expect(screen.getByText('My Podcast')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('should display download button for completed jobs', () => {
    const job = createMockJob({ status: 'completed' })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    expect(screen.getByRole('button', { name: 'Download (text)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toBeInTheDocument()
  })

  it('should not display download button for non-completed jobs', () => {
    const job = createMockJob({ status: 'pending' })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument()
  })

  it('should call onDownload when download button is clicked', async () => {
    const user = userEvent.setup()
    const job = createMockJob({ status: 'completed' })
    const onDownload = vi.fn().mockResolvedValue(undefined)

    render(<JobCard job={job} onDownload={onDownload} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    expect(onDownload).toHaveBeenCalledWith(job)
  })

  it('should display progress bar for processing jobs', () => {
    const job = createMockJob({ status: 'processing' })

    const { container } = render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    const progressBar = container.querySelector('.animate-pulse')
    expect(progressBar).toBeInTheDocument()
  })

  it('should not display progress bar for non-processing jobs', () => {
    const job = createMockJob({ status: 'completed' })

    const { container } = render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    const progressBar = container.querySelector('.animate-pulse')
    expect(progressBar).not.toBeInTheDocument()
  })

  it('should display error message when job has failed', () => {
    const job = createMockJob({
      status: 'failed',
      error_message: 'Transcription failed',
    })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    expect(screen.getByText('Transcription failed')).toBeInTheDocument()
  })

  it('should apply correct status class based on job status', () => {
    const { rerender } = render(
      <JobCard job={createMockJob({ status: 'pending' })} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />
    )
    expect(screen.getByText('pending')).toHaveClass('bg-yellow-100', 'text-yellow-800')

    rerender(<JobCard job={createMockJob({ status: 'processing' })} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)
    expect(screen.getByText('processing')).toHaveClass('bg-blue-100', 'text-blue-800')

    rerender(<JobCard job={createMockJob({ status: 'completed' })} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)
    expect(screen.getByText('completed')).toHaveClass('bg-green-100', 'text-green-800')

    rerender(<JobCard job={createMockJob({ status: 'failed' })} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)
    expect(screen.getByText('failed')).toHaveClass('bg-red-100', 'text-red-800')
  })

  it('should format date correctly', () => {
    const job = createMockJob({
      created_at: '2026-01-15T10:30:00Z',
    })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    // Date format depends on locale, just check it's rendered
    expect(screen.getByText(/Jan|15|2026/)).toBeInTheDocument()
  })
})
