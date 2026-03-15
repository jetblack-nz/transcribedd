import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import { useAuth } from '../hooks/useAuth'
import { useJobs } from '../hooks/useJobs'
import { JobCard } from '../components/JobCard'
import { supabase } from '../lib/supabase'
import type { Job } from '../types'

/** Split a line on **bold** and *italic* markers into TextRuns. */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }))
    } else if (part) {
      runs.push(new TextRun(part))
    }
  }
  return runs.length ? runs : [new TextRun('')]
}

// Parses markdown (headings, bullets, bold/italic) into a Word document
async function buildDocx(text: string): Promise<Blob> {
  const lines = text.split('\n')
  const children: Paragraph[] = []

  for (const line of lines) {
    if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3 }))
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2 }))
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1 }))
    } else if (line.trim() === '') {
      children.push(new Paragraph({ children: [new TextRun('')] }))
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      children.push(new Paragraph({ children: parseInline(line.slice(2).trim()), bullet: { level: 0 } }))
    } else {
      // Lines like **Heading:** — treat as Heading 2; otherwise paragraph with inline formatting
      const boldLine = line.match(/^\*\*(.+?)\*\*:?\s*$/)
      if (boldLine) {
        children.push(new Paragraph({ text: boldLine[1], heading: HeadingLevel.HEADING_2 }))
      } else {
        children.push(new Paragraph({ children: parseInline(line) }))
      }
    }
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

const DEFAULT_PROMPT = `You are a transcript formatter. Your job is to take a raw podcast transcript and format it cleanly — do NOT change, remove, summarise, or paraphrase any of the spoken content.

Apply the following formatting rules:
- Add a top-level heading with the episode title (if identifiable from context) or "Transcript"
- Break the transcript into logical sections based on topic changes, adding a short descriptive heading for each section
- Within each section, use paragraph breaks to separate distinct points or exchanges
- If there are clear sub-topics within a section, use a subheading
- Preserve all words exactly as spoken — do not correct, clean up, or omit anything
- Do not add summaries, introductions, conclusions, or any content that was not in the original transcript`

export function DashboardPage() {
  const { user } = useAuth()
  const { jobs, loading, error, deleteJob } = useJobs(user?.id)

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [promptLoading, setPromptLoading] = useState(true)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('processing_prompt').eq('id', user.id).single()
      .then(({ data }) => {
        setPrompt(data?.processing_prompt ?? DEFAULT_PROMPT)
        setPromptLoading(false)
      })
  }, [user])

  const handleSavePrompt = async () => {
    if (!user) return
    setPromptSaving(true)
    await supabase.from('profiles').update({ processing_prompt: prompt }).eq('id', user.id)
    setPromptSaving(false)
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
  }

  const triggerDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownload = async (job: Job) => {
    if (!job.transcript_path) return
    try {
      const { data, error } = await supabase.functions.invoke('get-transcript-url', {
        body: { jobId: job.id },
      })
      if (error) throw error
      if (!data?.url) throw new Error('No URL returned from server')
      const fileResp = await fetch(data.url)
      const text = await fileResp.text()
      triggerDownload(text, `${job.episode_title ?? job.id}.txt`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Download failed: ${msg}`)
    }
  }

  const handleDownloadDeluxe = async (job: Job) => {
    if (!job.transcript_path) return
    if (!prompt.trim()) {
      alert('Set a processing prompt in the settings below first.')
      return
    }
    try {
      const { data, error } = await supabase.functions.invoke('process-transcript', {
        body: { jobId: job.id },
      })
      if (error) {
        // Extract the real error message from the edge function response body
        const body = await (error as any).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      const docxBlob = await buildDocx(data.text)
      const url = URL.createObjectURL(docxBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.episode_title ?? job.id}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Download (docx) failed: ${msg}`)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading jobs…</p>
  }

  const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length
  const completedCount = jobs.filter((j) => j.status === 'completed').length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
          {jobs.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              {pendingCount > 0 ? `${pendingCount} in progress · ` : ''}
              {completedCount} completed
            </p>
          )}
        </div>
        <Link
          to="/search"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + New job
        </Link>
      </div>

      {/* Timing notice */}
      {pendingCount > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          Long podcasts can take up to 10 minutes to transcribe — hang tight.
        </p>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Jobs list */}
      {jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-4">🎙️</p>
          <p className="text-lg font-medium text-gray-600 mb-1">No jobs yet</p>
          <p className="text-sm">
            <Link to="/search" className="text-gray-900 underline underline-offset-2">
              Search for a podcast
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onDownload={handleDownload} onDownloadDeluxe={handleDownloadDeluxe} onDelete={(j) => deleteJob(j.id)} hasPrompt={!!prompt.trim()} />
          ))}
        </div>
      )}

      {/* Processing prompt section */}
      <div className="border-t border-gray-200 pt-8">
        <h2 className="text-base font-semibold text-gray-900 mb-1">AI processing prompt</h2>
        <p className="text-sm text-gray-500 mb-4">
          When you click <strong>Download (docx)</strong>, your transcript is sent to an AI with this prompt.
          Example: <em>"Summarise this podcast transcript in bullet points."</em>{' '}
          Formatting can take up to 3 minutes for long episodes — please be patient.
        </p>
        {!promptLoading && (
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Enter your processing prompt…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
            />
            <button
              onClick={handleSavePrompt}
              disabled={promptSaving}
              className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {promptSaving ? 'Saving…' : promptSaved ? 'Saved ✓' : 'Save prompt'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
