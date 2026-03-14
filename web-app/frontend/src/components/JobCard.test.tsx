import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { JobCard } from './JobCard'
import { createMockJob } from '../test/mocks/data'

describe('JobCard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  // onDownloadDeluxe
  it('calls onDownloadDeluxe when the Download (docx) button is clicked', async () => {
    const user = userEvent.setup()
    const job = createMockJob({ status: 'completed' })
    const onDownloadDeluxe = vi.fn().mockResolvedValue(undefined)

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={onDownloadDeluxe} hasPrompt={true} />)

    await user.click(screen.getByRole('button', { name: 'Download (docx)' }))

    expect(onDownloadDeluxe).toHaveBeenCalledWith(job)
  })

  // hasPrompt prop controls docx button
  it('disables the Download (docx) button when hasPrompt is false', () => {
    const job = createMockJob({ status: 'completed' })
    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toBeDisabled()
  })

  it('enables the Download (docx) button when hasPrompt is true', () => {
    const job = createMockJob({ status: 'completed' })
    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={true} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).not.toBeDisabled()
  })

  it('shows "Set a processing prompt in settings first" title when hasPrompt is false', () => {
    const job = createMockJob({ status: 'completed' })
    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toHaveAttribute(
      'title',
      'Set a processing prompt in settings first',
    )
  })

  it('shows "Process with your AI prompt and download as Word doc" title when hasPrompt is true', () => {
    const job = createMockJob({ status: 'completed' })
    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={true} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toHaveAttribute(
      'title',
      'Process with your AI prompt and download as Word doc',
    )
  })

  // DownloadButton state machine
  it('disables the button and shows a spinner while download is in flight', async () => {
    const user = userEvent.setup()
    let resolveDownload!: () => void
    const onDownload = vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveDownload = resolve }))
    const job = createMockJob({ status: 'completed' })

    const { container } = render(
      <JobCard job={job} onDownload={onDownload} onDownloadDeluxe={async () => {}} hasPrompt={false} />,
    )

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    expect(screen.getByRole('button', { name: 'Download (text)' })).toBeDisabled()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()

    resolveDownload()
  })

  it('shows ✓ immediately after a successful download', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn().mockResolvedValue(undefined)
    const job = createMockJob({ status: 'completed' })

    render(<JobCard job={job} onDownload={onDownload} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    await waitFor(() => expect(screen.getByText('✓')).toBeInTheDocument())
  })

  it('reverts the button to idle after 2 seconds following success', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn().mockResolvedValue(undefined)
    const job = createMockJob({ status: 'completed' })

    render(<JobCard job={job} onDownload={onDownload} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))
    await waitFor(() => expect(screen.getByText('✓')).toBeInTheDocument())

    // Wait for the real 2-second reset timer
    await new Promise<void>(resolve => { setTimeout(resolve, 2100) })
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download (text)' })).not.toBeDisabled()
  }, 10000)

  it('reverts the button to idle immediately when the download rejects', async () => {
    const user = userEvent.setup()
    const onDownload = vi.fn().mockRejectedValue(new Error('fail'))
    const job = createMockJob({ status: 'completed' })

    const { container } = render(
      <JobCard job={job} onDownload={onDownload} onDownloadDeluxe={async () => {}} hasPrompt={false} />,
    )

    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Download (text)' })).not.toBeDisabled())
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  // error_message title attribute
  it('sets the title attribute on the error paragraph to the full error_message', () => {
    const errorMessage = 'Detailed transcription failure reason'
    const job = createMockJob({ status: 'failed', error_message: errorMessage })

    render(<JobCard job={job} onDownload={async () => {}} onDownloadDeluxe={async () => {}} hasPrompt={false} />)

    expect(screen.getByText(errorMessage)).toHaveAttribute('title', errorMessage)
  })
})
