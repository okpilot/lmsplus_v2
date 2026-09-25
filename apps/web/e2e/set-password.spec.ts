import { expect, type Page, test } from '@playwright/test'
import {
  cleanupTempPasswordStudents,
  createArmedTempPasswordStudent,
  readTempPasswordExpiresAt,
} from './helpers/temp-password'

// Run without saved auth state — each test signs in as its own throwaway student.
test.use({ storageState: { cookies: [], origins: [] } })

const TEMP_PASSWORD = 'e2e-temp-password-2026!'
const NEW_PASSWORD = 'e2e-new-password-2026!'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('Set password — forced temp-password change lifecycle', () => {
  test.afterEach(async () => {
    await cleanupTempPasswordStudents()
  })

  test('an armed login lands on /auth/set-password carrying next, and a reload stays there', async ({
    page,
  }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: TEMP_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    await page.goto(`/?next=${encodeURIComponent('/app/progress')}`)
    await signIn(page, email, TEMP_PASSWORD)

    await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })
    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/set-password')
    expect(url.searchParams.get('next')).toBe('/app/progress')
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible()

    // Mid-flow reload must not escape the gate.
    await page.reload()
    const reloadedUrl = new URL(page.url())
    expect(reloadedUrl.pathname).toBe('/auth/set-password')
    await expect(page.getByRole('heading', { name: 'Set your password' })).toBeVisible()
  })

  test('an armed user navigating directly to a protected page is bounced back to set-password', async ({
    page,
  }) => {
    const { email } = await createArmedTempPasswordStudent({
      password: TEMP_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    await page.goto('/')
    await signIn(page, email, TEMP_PASSWORD)
    await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })

    // A direct hit on an unrelated /app page must still redirect back to the
    // gate — carrying the attempted path as `next`, not the original login
    // `next`. `/app/dashboard` is excluded: `safeNextPath` treats it as the
    // default destination and drops `next` entirely (safe-next-path.ts
    // `DEFAULT_DESTINATIONS`), so this uses a distinct page instead.
    await page.goto('/app/quiz')
    await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })
    const url = new URL(page.url())
    expect(url.pathname).toBe('/auth/set-password')
    expect(url.searchParams.get('next')).toBe('/app/quiz')
  })

  test('setting a new password clears the column, lands on next, and the new password signs in cleanly', async ({
    page,
  }) => {
    const { userId, email } = await createArmedTempPasswordStudent({
      password: TEMP_PASSWORD,
      expiresInMs: SEVEN_DAYS_MS,
    })

    await page.goto(`/?next=${encodeURIComponent('/app/progress')}`)
    await signIn(page, email, TEMP_PASSWORD)
    await page.waitForURL('**/auth/set-password**', { timeout: 15_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe('/app/progress')

    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Set password' }).click()

    // window.location.assign — a hard navigation, so the proxy re-reads state
    // from scratch. The temp-password gate now passes ('none'), but the
    // consent gate is cookie-only (proxy.ts) and this flow never ran
    // /auth/login-complete's consent-cookie branch — the temp-password check
    // there short-circuits before it. A DB consent record (seeded by
    // createArmedTempPasswordStudent) does not itself set the cookie, so
    // this lands on /consent once, exactly like a brand-new student would.
    // Handle it the same way the other login specs do (login-return-to.spec.ts).
    await page.waitForURL('**/consent**', { timeout: 15_000 })
    expect(new URL(page.url()).searchParams.get('next')).toBe('/app/progress')
    await page.getByRole('checkbox', { name: /terms of service/i }).check()
    await page.getByRole('checkbox', { name: /privacy policy/i }).check()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.waitForURL('**/app/progress', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()

    // Non-vacuous: read the column via service role, not the UI, to confirm
    // the gate can never re-arm from stale client state.
    expect(await readTempPasswordExpiresAt(userId)).toBeNull()

    // Log out and relogin with the new password — no set-password detour.
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL('/', { timeout: 15_000 })

    await signIn(page, email, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    const finalUrl = new URL(page.url())
    expect(finalUrl.pathname).toBe('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})
