import { test, expect } from './fixtures'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth')
  })

  test('should display login form', async ({ page }) => {
    await expect(page.getByText('Transcribedd')).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Wait for error message
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })

  test('should redirect to dashboard on successful login', async ({ page }) => {
    const testEmail = process.env.TEST_USER_EMAIL || 'test@example.com'
    const testPassword = process.env.TEST_USER_PASSWORD || 'testpassword123'

    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await expect(page).toHaveURL('/', { timeout: 10000 })
    await expect(page.getByText('Jobs')).toBeVisible()
  })
})

test.describe('Protected Routes', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/auth', { timeout: 5000 })
  })

  test('should redirect unauthenticated users from search to login', async ({ page }) => {
    await page.goto('/search')
    await expect(page).toHaveURL('/auth', { timeout: 5000 })
  })
})
