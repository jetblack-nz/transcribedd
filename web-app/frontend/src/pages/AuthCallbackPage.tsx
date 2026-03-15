import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase may redirect here with ?error=... if auth fails upstream
    // (e.g. signups disabled, access denied). Surface that before calling getSession.
    const params = new URLSearchParams(window.location.search)
    const urlError = params.get('error_description') ?? params.get('error')
    if (urlError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(decodeURIComponent(urlError.replace(/\+/g, ' ')))
      return
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[AuthCallback] exchange error:', error.message)
        setError(error.message)
        return
      }
      if (session) {
        navigate('/', { replace: true })
      } else {
        // No session and no error usually means the code was already consumed
        // or the code verifier was missing. Log the URL for debugging.
        console.warn('[AuthCallback] no session, URL params:', window.location.search)
        navigate('/auth', { replace: true })
      }
    })
  }, [navigate])

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-2 text-sm">
        <p className="text-red-600 font-medium">Sign-in failed</p>
        <p className="text-gray-500">{error}</p>
        <a href="/auth" className="text-blue-600 underline">Back to sign in</a>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
      Completing sign in…
    </div>
  )
}
