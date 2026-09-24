import { expect, test } from '@playwright/test'
import { ensureNoConsentUser, removeNoConsentUser } from './helpers/no-consent-user'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD } from './helpers/supabase'

// Run without saved auth state — mirrors login.spec.ts, which this file extends
// with the `next` destination behaviour.
test.use({ storageState: { cookies: [], origins: [] } })

// Separate user, WITHOUT seeded consent records — the whole point of the block
// below is to exercise the consent hop while a `next` destination is pending.
const NO_CONSENT_TEST_EMAIL = 'e2e-login-next-no-consent@lmsplus.local'
const NO_CONSENT_TEST_PASSWORD = 'e2e-login-next-no-consent-password-2026!'

test.describe
  .serial('login → consent → next destination', () => {
    test.beforeAll(async () => {
      await ensureNoConsentUser({
        email: NO_CONSENT_TEST_EMAIL,
        password: NO_CONSENT_TEST_PASSWORD,
        fullName: 'E2E Login-Next No-Consent Student',
      })
    })

    test.afterAll(async () => {
      await removeNoConsentUser(NO_CONSENT_TEST_EMAIL)
    })

    test('a deep link for a user without consent survives the consent hop and lands on the original destination', async ({
      page,
    }) => {
      // Hitting a protected page while logged out redirects to login carrying `?next=`.
      await page.goto('/app/internal-exam')
      const loginUrl = new URL(page.url())
      expect(loginUrl.pathname).toBe('/')
      expect(loginUrl.searchParams.get('next')).toBe('/app/internal-exam')

      await page.getByLabel('Email address').fill(NO_CONSENT_TEST_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(NO_CONSENT_TEST_PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()

      // No consent on file — the consent gate fires instead of the original
      // destination, but it must carry `next` forward rather than dropping it.
      await page.waitForURL('**/consent**', { timeout: 15_000 })
      const consentUrl = new URL(page.url())
      expect(consentUrl.pathname).toBe('/consent')
      expect(consentUrl.searchParams.get('next')).toBe('/app/internal-exam')

      await page.getByRole('checkbox', { name: /terms of service/i }).check()
      await page.getByRole('checkbox', { name: /privacy policy/i }).check()
      await page.getByRole('button', { name: 'Continue' }).click()

      // Consent recorded — lands on the originally-requested page, not the dashboard.
      await page.waitForURL('**/app/internal-exam', { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Internal Exam' })).toBeVisible()
    })
  })

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
