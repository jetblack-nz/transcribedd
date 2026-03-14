# E2E Test Setup

This directory contains Playwright end-to-end tests.

## Prerequisites

Before running E2E tests, you need:

1. **Running Supabase instance** (local or remote)
2. **Test user credentials** set in environment variables
3. **Valid Supabase configuration** in `.env.local`

## Environment Variables

Create a `.env.test` file in the `web-app/frontend` directory:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-anon-key

# Test User Credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testpassword123
```

## Setup

1. **Start local Supabase** (if testing locally):
   ```bash
   supabase start
   ```

2. **Create a test user** in Supabase:
   ```sql
   -- This should be done via the Supabase dashboard or CLI
   ```

3. **Install Playwright browsers** (if not already done):
   ```bash
   npm run test:e2e -- --install
   ```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see the browser)
npm run test:e2e:headed

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run specific test file
npm run test:e2e e2e/auth.spec.ts

# Run tests in specific browser
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox
npm run test:e2e -- --project=webkit
```

## Test Structure

- `fixtures.ts` - Custom Playwright fixtures including authenticated user setup
- `auth.spec.ts` - Authentication flow tests
- `dashboard.spec.ts` - Dashboard page tests
- `search.spec.ts` - Search and job creation flow tests

## Notes

- E2E tests require a real backend (Supabase) to be running
- Some tests may fail if the Podcast Index API is not configured
- Tests use a real database, so they may create test data
- Consider using a separate Supabase project for testing
