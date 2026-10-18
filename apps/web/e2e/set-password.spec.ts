import { expect, type Page, test } from '@playwright/test'
import {
  cleanupLinkStudents,
  createLinkStudent,
  issueSetPasswordLink,
  readPendingMarker,
  softDeleteLinkStudent,
} from './helpers/set-password-link'
import { getAdminClient } from './helpers/supabase'

// Run without saved auth state — each test is its own throwaway student.
test.use({ storageState: { cookies: [], origins: [] } })

const NEW_PASSWORD = 'e2e-new-password-2026!'
const OTHER_PASSWORD = 'e2e-other-password-2026!'
const FORM_HEADING = 'Set your password'
const FORGOT_PASSWORD_PATH = '/auth/forgot-password'

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function submitNewPassword(page: Page, password: string) {
  await page.getByLabel('New password').fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Set password' }).click()
}

/** True when Auth accepts the password — checked against the API, not the UI. */
async function passwordIsAccepted(email: string, password: string): Promise<boolean> {
  const { data, error } = await getAdminClient().auth.signInWithPassword({ email, password })
  return !error && !!data.session
}

async function expectLinkRefused(page: Page) {
  await expect(page.locator(`a[href="${FORGOT_PASSWORD_PATH}"]`).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('heading', { name: FORM_HEADING })).toBeHidden()
  expect(new URL(page.url()).pathname).toBe('/auth/set-password')
}

test.describe('Set password — one-time link lifecycle', () => {
  test.afterEach(async () => {
    await cleanupLinkStudents()
  })

  test('link scanners fetching the URL do not consume it, and a reload keeps the form', async ({
    page,
  }) => {
    const { email } = await createLinkStudent({ slot: 'sp-1-scanner-reload' })
    const { path } = await issueSetPasswordLink(email)

    // Mail scanners prefetch with GET (and HEAD); neither may spend the token.
    for (let i = 0; i < 2; i++) {
      const res = await page.request.get(path)
      expect(res.status()).toBe(200)
    }

    await page.goto(path)
    await expect(page.getByRole('heading', { name: FORM_HEADING })).toBeVisible()

    await page.reload()
    expect(new URL(page.url()).pathname).toBe('/auth/set-password')
    await expect(page.getByRole('heading', { name: FORM_HEADING })).toBeVisible()

    // Non-vacuous: after all those GETs the token still works.
    await submitNewPassword(page, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  })

  test('setting a password signs the student in, clears the marker, and the new password signs in again', async ({
    page,
  }) => {
    const { userId, email } = await createLinkStudent({ slot: 'sp-2-lifecycle' })
    const { path } = await issueSetPasswordLink(email)
    expect(await readPendingMarker(userId)).not.toBeNull()

    await page.goto(path)
    await submitNewPassword(page, NEW_PASSWORD)

    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(await readPendingMarker(userId)).toBeNull()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL('/', { timeout: 15_000 })

    await signIn(page, email, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('a spent link is refused in a fresh browser context and sets no password', async ({
    page,
    browser,
  }) => {
    const { email } = await createLinkStudent({ slot: 'sp-3-reuse' })
    const { path } = await issueSetPasswordLink(email)

    await page.goto(path)
    await submitNewPassword(page, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    expect(await passwordIsAccepted(email, NEW_PASSWORD)).toBe(true)

    const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const freshPage = await fresh.newPage()
      await freshPage.goto(path)
      await submitNewPassword(freshPage, OTHER_PASSWORD)
      await expectLinkRefused(freshPage)
    } finally {
      await fresh.close()
    }

    expect(await passwordIsAccepted(email, OTHER_PASSWORD)).toBe(false)
    expect(await passwordIsAccepted(email, NEW_PASSWORD)).toBe(true)
  })

  test('issuing a second link voids the first, and the second still works', async ({ page }) => {
    const { userId, email } = await createLinkStudent({ slot: 'sp-4-rotation' })
    const linkA = await issueSetPasswordLink(email)
    const linkB = await issueSetPasswordLink(email)
    expect(linkB.tokenHash).not.toBe(linkA.tokenHash)

    await page.goto(linkA.path)
    await submitNewPassword(page, OTHER_PASSWORD)
    await expectLinkRefused(page)
    expect(await passwordIsAccepted(email, OTHER_PASSWORD)).toBe(false)
    expect(await readPendingMarker(userId)).not.toBeNull()

    await page.goto(linkB.path)
    await submitNewPassword(page, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
    expect(await passwordIsAccepted(email, NEW_PASSWORD)).toBe(true)
  })

  test('a URL without a token shows the unavailable panel linking to Forgot password', async ({
    page,
  }) => {
    await page.goto('/auth/set-password')

    await expect(page.locator(`a[href="${FORGOT_PASSWORD_PATH}"]`).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: FORM_HEADING })).toBeHidden()
    await expect(page.getByLabel('New password')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe('/auth/set-password')
  })

  test('a student who has not accepted the terms is sent to /consent after setting a password', async ({
    page,
  }) => {
    const { userId, email } = await createLinkStudent({
      slot: 'sp-5-unconsented',
      consented: false,
    })
    const { path } = await issueSetPasswordLink(email)

    await page.goto(path)
    await submitNewPassword(page, NEW_PASSWORD)

    await page.waitForURL('**/consent**', { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/consent')
    expect(await readPendingMarker(userId)).toBeNull()
  })

  test('a link for a deactivated student is refused and sets no password', async ({ page }) => {
    const { userId, email } = await createLinkStudent({ slot: 'sp-6-soft-deleted' })
    const { path } = await issueSetPasswordLink(email)
    await softDeleteLinkStudent(userId)

    await page.goto(path)
    await submitNewPassword(page, NEW_PASSWORD)

    await expectLinkRefused(page)
    expect(await passwordIsAccepted(email, NEW_PASSWORD)).toBe(false)
    expect(await readPendingMarker(userId)).not.toBeNull()
  })

  test('the link page is served with Referrer-Policy no-referrer', async ({ page }) => {
    const { email } = await createLinkStudent({ slot: 'sp-7-referrer' })
    const { path } = await issueSetPasswordLink(email)

    const response = await page.goto(path)

    expect(response?.status()).toBe(200)
    expect(response?.headers()['referrer-policy']).toBe('no-referrer')
  })
})
