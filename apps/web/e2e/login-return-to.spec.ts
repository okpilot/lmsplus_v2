import { expect, test } from '@playwright/test'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Run without saved auth state — mirrors login.spec.ts, which this file extends
// with the `next` destination behaviour.
test.use({ storageState: { cookies: [], origins: [] } })

test('logging in from a deep link returns to that page instead of the dashboard', async ({
  page,
}) => {
  await ensureLoginTestUser()

  // Hitting a protected page while logged out redirects to the login page
  // carrying it as `?next=`.
  await page.goto('/app/internal-exam')
  const loginUrl = new URL(page.url())
  expect(loginUrl.pathname).toBe('/')
  expect(loginUrl.searchParams.get('next')).toBe('/app/internal-exam')

  await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Lands on the originally-requested page, not /app/dashboard.
  await page.waitForURL('**/app/internal-exam', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
})

test('a next destination carrying its own query string survives the round trip', async ({
  page,
}) => {
  await ensureLoginTestUser()

  await page.goto('/app/quiz?x=1')
  const loginUrl = new URL(page.url())
  expect(loginUrl.pathname).toBe('/')
  expect(loginUrl.searchParams.get('next')).toBe('/app/quiz?x=1')

  await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // The quiz page reads no query params — the server-rendered page ignores
  // `x`, so the URL Playwright ends up on is the exact next target unchanged.
  await page.waitForURL('**/app/quiz?x=1', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible()
})
