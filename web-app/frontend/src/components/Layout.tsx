import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="font-semibold text-gray-900 tracking-tight">
            Transcribedd
          </Link>
          {user && (
            <div className="flex items-center gap-6">
              <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Jobs
              </Link>
              <Link to="/search" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Search
              </Link>
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-400 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
