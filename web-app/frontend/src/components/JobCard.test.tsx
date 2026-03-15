import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../test/utils/test-utils'
import { JobCard } from './JobCard'
import { createMockJob } from '../test/mocks/data'

const defaultProps = {
  onDownload: async () => {},
  onDownloadDeluxe: async () => {},
  onDelete: async () => {},
  hasPrompt: false,
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Job options' }))
}

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

    render(<JobCard job={job} {...defaultProps} />)

    expect(screen.getByText('Episode 1')).toBeInTheDocument()
    expect(screen.getByText(/My Podcast/)).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows the ··· menu button', () => {
    render(<JobCard job={createMockJob()} {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Job options' })).toBeInTheDocument()
  })

  it('opens the dropdown when ··· is clicked', async () => {
    const user = userEvent.setup()
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} />)

    await openMenu(user)

    expect(screen.getByRole('button', { name: 'Download (text)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('closes the dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <JobCard job={createMockJob({ status: 'pending' })} {...defaultProps} />
        <div data-testid="outside">Outside</div>
      </div>,
    )

    await openMenu(user)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('shows Download (docx) button directly on card for completed jobs', () => {
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toBeInTheDocument()
  })

  it('does not show Download (docx) button for non-completed jobs', () => {
    render(<JobCard job={createMockJob({ status: 'pending' })} {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Download (docx)' })).not.toBeInTheDocument()
  })

  it('shows Download (text) in menu for completed jobs', async () => {
    const user = userEvent.setup()
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} />)

    await openMenu(user)

    expect(screen.getByRole('button', { name: 'Download (text)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('does not show Download (text) in menu for non-completed jobs', async () => {
    const user = userEvent.setup()
    render(<JobCard job={createMockJob({ status: 'pending' })} {...defaultProps} />)

    await openMenu(user)

    expect(screen.queryByRole('button', { name: 'Download (text)' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('should call onDownload when Download (text) is clicked in menu', async () => {
    const user = userEvent.setup()
    const job = createMockJob({ status: 'completed' })
    const onDownload = vi.fn().mockResolvedValue(undefined)

    render(<JobCard job={job} {...defaultProps} onDownload={onDownload} />)

    await openMenu(user)
    await user.click(screen.getByRole('button', { name: 'Download (text)' }))

    expect(onDownload).toHaveBeenCalledWith(job)
  })

  it('should call onDownloadDeluxe when Download (docx) is clicked', async () => {
    const user = userEvent.setup()
    const job = createMockJob({ status: 'completed' })
    const onDownloadDeluxe = vi.fn().mockResolvedValue(undefined)

    render(<JobCard job={job} {...defaultProps} onDownloadDeluxe={onDownloadDeluxe} hasPrompt={true} />)

    await user.click(screen.getByRole('button', { name: 'Download (docx)' }))

    expect(onDownloadDeluxe).toHaveBeenCalledWith(job)
  })

  it('disables Download (docx) when hasPrompt is false', () => {
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} hasPrompt={false} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toBeDisabled()
  })

  it('enables Download (docx) when hasPrompt is true', () => {
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} hasPrompt={true} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).not.toBeDisabled()
  })

  it('shows correct title on Download (docx) when hasPrompt is false', () => {
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} hasPrompt={false} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toHaveAttribute(
      'title',
      'Set a processing prompt in settings first',
    )
  })

  it('shows correct title on Download (docx) when hasPrompt is true', () => {
    render(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} hasPrompt={true} />)
    expect(screen.getByRole('button', { name: 'Download (docx)' })).toHaveAttribute(
      'title',
      'Process with your AI prompt and download as Word doc',
    )
  })

  it('calls onDelete and goes into deleting state when Delete is clicked', async () => {
    const user = userEvent.setup()
    const job = createMockJob({ status: 'completed' })
    let resolveDelete!: () => void
    const onDelete = vi.fn().mockReturnValue(new Promise<void>((res) => { resolveDelete = res }))

    render(<JobCard job={job} {...defaultProps} onDelete={onDelete} />)

    await openMenu(user)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDelete).toHaveBeenCalledWith(job)
    resolveDelete()
  })

  it('should display progress bar for processing jobs', () => {
    const job = createMockJob({ status: 'processing' })

    const { container } = render(<JobCard job={job} {...defaultProps} />)

    const progressBar = container.querySelector('.animate-pulse')
    expect(progressBar).toBeInTheDocument()
  })

  it('should not display progress bar for non-processing jobs', () => {
    const job = createMockJob({ status: 'completed' })

    const { container } = render(<JobCard job={job} {...defaultProps} />)

    const progressBar = container.querySelector('.animate-pulse')
    expect(progressBar).not.toBeInTheDocument()
  })

  it('should display error message when job has failed', () => {
    const job = createMockJob({
      status: 'failed',
      error_message: 'Transcription failed',
    })

    render(<JobCard job={job} {...defaultProps} />)

    expect(screen.getByText('Transcription failed')).toBeInTheDocument()
  })

  it('sets the title attribute on the error paragraph to the full error_message', () => {
    const errorMessage = 'Detailed transcription failure reason'
    const job = createMockJob({ status: 'failed', error_message: errorMessage })

    render(<JobCard job={job} {...defaultProps} />)

    expect(screen.getByText(errorMessage)).toHaveAttribute('title', errorMessage)
  })

  it('should apply correct status class based on job status', () => {
    const { rerender } = render(
      <JobCard job={createMockJob({ status: 'pending' })} {...defaultProps} />,
    )
    expect(screen.getByText('pending')).toHaveClass('bg-yellow-100', 'text-yellow-800')

    rerender(<JobCard job={createMockJob({ status: 'processing' })} {...defaultProps} />)
    expect(screen.getByText('processing')).toHaveClass('bg-blue-100', 'text-blue-800')

    rerender(<JobCard job={createMockJob({ status: 'completed' })} {...defaultProps} />)
    expect(screen.getByText('completed')).toHaveClass('bg-green-100', 'text-green-800')

    rerender(<JobCard job={createMockJob({ status: 'failed' })} {...defaultProps} />)
    expect(screen.getByText('failed')).toHaveClass('bg-red-100', 'text-red-800')
  })

  it('should format date correctly', () => {
    const job = createMockJob({
      created_at: '2026-01-15T10:30:00Z',
    })

    render(<JobCard job={job} {...defaultProps} />)

    expect(screen.getByText(/Jan|15|2026/)).toBeInTheDocument()
  })
})
