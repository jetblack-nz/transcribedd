import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // getSession() awaits initializePromise internally, which means it waits
    // for the PKCE code exchange to complete before returning. Once done, the
    // session is persisted to storage and we can navigate to the dashboard.
    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? '/' : '/auth', { replace: true })
    })
  }, [navigate])

  return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
      Completing sign in…
    </div>
  )
}
