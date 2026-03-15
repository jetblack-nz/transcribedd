import { test as base } from '@playwright/test'
import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

type AuthSession = { session: Record<string, unknown>; supabaseUrl: string }

/** Loaded once per worker process from the file written by global.setup.ts */
function loadCachedAuthSession(): AuthSession {
  const filePath = join(__dirname, '.auth-session.json')
  return JSON.parse(readFileSync(filePath, 'utf8')) as AuthSession
}

/**
 * Extended test fixture with Supabase client for E2E tests
 */
export const test = base.extend<{
  supabase: SupabaseClient
  authenticatedPage: any
}>({
  supabase: async ({}, use) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || ''

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    await use(supabase)
  },

  authenticatedPage: async ({ page }, use) => {
    // Load the session cached by global.setup.ts (one sign-in for the whole run,
    // avoids hitting Supabase's auth rate limit with parallel workers).
    const { session, supabaseUrl } = loadCachedAuthSession()

    // Derive the localStorage key Supabase JS v2 uses for session storage.
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    const storageKey = `sb-${projectRef}-auth-token`

    // Inject the session before any page scripts run so ProtectedRoute sees it.
    await page.addInitScript(
      ({ key, s }: { key: string; s: unknown }) => {
        window.localStorage.setItem(key, JSON.stringify(s))
      },
      { key: storageKey, s: session },
    )

    await page.goto('/')
    await page.waitForURL('/', { timeout: 10000 })

    await use(page)
  },
})

export { expect } from '@playwright/test'
