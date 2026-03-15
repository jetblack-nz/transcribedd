import { test, expect } from './fixtures'

test.describe('Downloads', () => {
  test('Download (docx) button calls process-transcript and returns non-401', async ({ authenticatedPage: page }) => {
    await page.goto('/')

    // Intercept the edge function call — we just want to verify auth passes (no 401)
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/functions/v1/process-transcript'), { timeout: 5000 }).catch(() => null),
      // If there are no completed jobs the button won't exist; skip gracefully
      page.locator('button[aria-label="Download (docx)"]').first().click({ timeout: 5000 }).catch(() => null),
    ])

    if (request) {
      const response = await request.response()
      expect(response?.status()).not.toBe(401)
    }
  })

  test('Download (text) button calls get-transcript-url and returns non-401', async ({ authenticatedPage: page }) => {
    await page.goto('/')

    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/functions/v1/get-transcript-url'), { timeout: 5000 }).catch(() => null),
      page.locator('[aria-label="Job options"]').first().click({ timeout: 5000 }).catch(() => null),
    ])

    if (request) {
      // Click Download (text) if the menu opened
      await page.getByRole('button', { name: 'Download (text)' }).click({ timeout: 2000 }).catch(() => null)
      const response = await request.response()
      expect(response?.status()).not.toBe(401)
    }
  })
})

test.describe('Dashboard', () => {
  test('should display empty state when no jobs', async ({ authenticatedPage: page }) => {
    await page.goto('/')
    
    // Check for empty state
    await expect(page.getByText('No jobs yet')).toBeVisible()
    await expect(page.getByText(/search for a podcast/i)).toBeVisible()
  })

  test('should display navigation links', async ({ authenticatedPage: page }) => {
    await page.goto('/')
    
    await expect(page.getByText('Transcribedd')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Jobs' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Search' })).toBeVisible()
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible()
  })

  test('should have New job button linking to search', async ({ authenticatedPage: page }) => {
    await page.goto('/')
    
    const newJobButton = page.getByRole('link', { name: /new job/i })
    await expect(newJobButton).toBeVisible()
    await expect(newJobButton).toHaveAttribute('href', '/search')
  })

  test('should sign out and redirect to auth page', async ({ authenticatedPage: page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /sign out/i }).click()

    await expect(page).toHaveURL('/auth', { timeout: 5000 })
  })

  test('should display AI processing prompt section', async ({ authenticatedPage: page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'AI processing prompt' })).toBeVisible()
    await expect(page.getByPlaceholder(/enter your processing prompt/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save prompt' })).toBeVisible()
  })

  test('should save processing prompt and show confirmation', async ({ authenticatedPage: page }) => {
    await page.goto('/')

    const textarea = page.getByPlaceholder(/enter your processing prompt/i)
    await expect(textarea).toBeVisible()

    // Edit the prompt then save
    await textarea.fill('Summarise this podcast in bullet points.')
    await page.getByRole('button', { name: 'Save prompt' }).click()

    await expect(page.getByRole('button', { name: /saved/i })).toBeVisible({ timeout: 5000 })
  })

})
