import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Runs once before all tests. Signs in with the test user and caches the session
 * to a file so that worker fixtures don't need to call signInWithPassword per-test
 * (which triggers Supabase's auth rate limit when 8+ workers run concurrently).
 */
async function globalSetup() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const testEmail = process.env.TEST_USER_EMAIL
  const testPassword = process.env.TEST_USER_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    throw new Error('Missing required env vars for E2E auth setup. Check .env.local.')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (error || !data.session) {
    throw new Error(`Global auth setup failed: ${error?.message ?? 'no session returned'}`)
  }

  writeFileSync(
    join(__dirname, '.auth-session.json'),
    JSON.stringify({ session: data.session, supabaseUrl }),
  )
}

export default globalSetup
