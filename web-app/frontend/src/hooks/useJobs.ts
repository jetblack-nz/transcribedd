import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Job } from '../types'

export function useJobs(userId: string | undefined) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setJobs(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchJobs()
  }, [fetchJobs])

  // Realtime subscription: re-fetch on any change to the user's jobs
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('jobs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `user_id=eq.${userId}` },
        () => { fetchJobs() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchJobs])

  const createJob = async (job: {
    podcast_title: string
    episode_title: string
    episode_url: string
    audio_file_url?: string
  }) => {
    const parsed = (() => { try { return new URL(job.episode_url ?? '') } catch { return null } })()
    if (
      !parsed ||
      parsed.protocol !== 'https:' ||
      /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname)
    ) {
      throw new Error('Invalid episode URL — must be a public HTTPS address')
    }
    const { data, error } = await supabase.from('jobs').insert({ ...job, user_id: userId }).select().single()
    if (error) throw error
    return data as Job
  }

  return { jobs, loading, error, createJob, refetch: fetchJobs }
}
