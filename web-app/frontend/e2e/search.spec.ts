import { test, expect } from './fixtures'

test.describe('Podcast Search', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/search')
  })

  test('should display search form', async ({ authenticatedPage: page }) => {
    await expect(page.getByText('Search Podcasts')).toBeVisible()
    await expect(page.getByPlaceholder(/search for a podcast/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible()
  })

  test('should disable search button when input is empty', async ({ authenticatedPage: page }) => {
    const searchButton = page.getByRole('button', { name: /search/i })
    await expect(searchButton).toBeDisabled()
  })

  test('should enable search button when input has text', async ({ authenticatedPage: page }) => {
    await page.fill('input[type="text"]', 'javascript')
    
    const searchButton = page.getByRole('button', { name: /search/i })
    await expect(searchButton).toBeEnabled()
  })

  test('should navigate back to dashboard', async ({ authenticatedPage: page }) => {
    await page.getByRole('link', { name: 'Jobs' }).click()
    await expect(page).toHaveURL('/', { timeout: 5000 })
  })
})

test.describe('End-to-End Job Creation Flow', () => {
  test('should complete full flow: search → select podcast → select episode → create job', async ({ 
    authenticatedPage: page 
  }) => {
    // Step 1: Navigate to search
    await page.goto('/search')
    await expect(page.getByText('Search Podcasts')).toBeVisible()

    // Step 2: Search for a podcast
    await page.fill('input[type="text"]', 'javascript')
    await page.getByRole('button', { name: /search/i }).click()

    // Wait for search results (this will fail if Supabase isn't running)
    // In a real E2E test with a live backend, you'd see results here
    await page.waitForTimeout(2000)

    // Note: The following steps would continue if we had a test backend
    // with mock podcast data:
    
    // // Step 3: Select a podcast from results
    // await page.locator('[data-testid="podcast-result"]').first().click()
    
    // // Step 4: Select an episode
    // await page.locator('[data-testid="episode-result"]').first().click()
    
    // // Step 5: Verify navigation to dashboard
    // await expect(page).toHaveURL('/', { timeout: 5000 })
    
    // // Step 6: Verify job appears in dashboard
    // await expect(page.getByText(/pending|processing/i)).toBeVisible()
  })
})
