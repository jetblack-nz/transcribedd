import { test as base } from '@playwright/test'
import { SupabaseClient, createClient } from '@supabase/supabase-js'

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

  authenticatedPage: async ({ page, supabase }, use) => {
    // Sign in with test credentials
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com'
    const testPassword = process.env.TEST_USER_PASSWORD || 'testpassword123'

    await page.goto('/auth')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button[type="submit"]')
    
    // Wait for navigation to dashboard
    await page.waitForURL('/', { timeout: 5000 })

    await use(page)
    
    // Clean up: sign out
    await supabase.auth.signOut()
  },
})

export { expect } from '@playwright/test'
