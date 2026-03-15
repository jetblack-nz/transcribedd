import { test, expect } from './fixtures'

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
