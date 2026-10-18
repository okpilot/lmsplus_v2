import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  cleanupLinkStudents,
  createLinkStudent,
  issueSetPasswordLink,
  softDeleteLinkStudent,
} from '../helpers/set-password-link'
import { getAdminClient } from '../helpers/supabase'

/**
 * Vectors II / IJ / IK — sessions around the one-time set-password link
 * (`setPasswordFromLink`, #1536, Decision 132).
 *
 * II: a session opened on the account BEFORE the link is used (an old
 *     credential's holder) must not survive the student setting their password.
 * IJ: a valid link for a deactivated account must leave no session behind,
 *     in the browser or at the Auth refresh layer.
 * IK: a link spent on a FAILED password write leaves a live recovery session;
 *     it must stay pinned to `/auth/reset-password` (`__recovery_pending`).
 */

test.use({ storageState: { cookies: [], origins: [] } })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')

const OLD_PASSWORD = 'rt-old-credential-2026!'
const NEW_PASSWORD = 'rt-new-own-password-2026!'
const FORGOT_PASSWORD_PATH = '/auth/forgot-password'
const RECOVERY_PENDING_COOKIE = '__recovery_pending'

function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function setKnownPassword(userId: string, password: string): Promise<void> {
  const { error } = await getAdminClient().auth.admin.updateUserById(userId, { password })
  if (error) throw new Error(`setKnownPassword: ${error.message}`)
}

async function submitNewPassword(page: Page, password: string) {
  await page.getByLabel('New password').fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Set password' }).click()
}

async function authCookieNames(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies()
  return cookies
    .filter((c) => c.name.startsWith('sb-') && c.name.includes('auth-token') && c.value !== '')
    .map((c) => c.name)
}

async function freshContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } })
}

test.describe('Red team — set-password link sessions', () => {
  test.afterEach(async () => {
    await cleanupLinkStudents()
  })

  test('(Vector II) setting a password from the link revokes a session opened on the account before it', async ({
    page,
  }) => {
    const { userId, email } = await createLinkStudent({ slot: 'rt-ii-prior-session' })
    await setKnownPassword(userId, OLD_PASSWORD)

    // Attacker holds a session from an older credential.
    const attacker = anonClient()
    const { data: signIn, error: signInError } = await attacker.auth.signInWithPassword({
      email,
      password: OLD_PASSWORD,
    })
    expect(signInError).toBeNull()
    expect(signIn.session?.refresh_token).toBeTruthy()

    // CONTROL: without the set-password write, that session refreshes.
    const { data: refreshed, error: refreshError } = await anonClient().auth.refreshSession({
      refresh_token: signIn.session?.refresh_token as string,
    })
    expect(refreshError).toBeNull()
    const liveRefreshToken = refreshed.session?.refresh_token
    expect(liveRefreshToken).toBeTruthy()

    const { path } = await issueSetPasswordLink(email)
    await page.goto(path)
    await submitNewPassword(page, NEW_PASSWORD)
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

    const { data: after, error: afterError } = await anonClient().auth.refreshSession({
      refresh_token: liveRefreshToken as string,
    })
    expect(afterError).not.toBeNull()
    expect(after.session).toBeNull()

    const { error: oldPasswordError } = await anonClient().auth.signInWithPassword({
      email,
      password: OLD_PASSWORD,
    })
    expect(oldPasswordError).not.toBeNull()
  })

  test('(Vector IJ) a valid link for a deactivated student leaves no session in the browser', async ({
    browser,
  }) => {
    // CONTROL: a live student following the same flow ends authenticated.
    const live = await createLinkStudent({ slot: 'rt-ij-live-control' })
    const liveLink = await issueSetPasswordLink(live.email)
    const liveContext = await freshContext(browser)
    try {
      const livePage = await liveContext.newPage()
      await livePage.goto(liveLink.path)
      await submitNewPassword(livePage, NEW_PASSWORD)
      await livePage.waitForURL('**/app/dashboard', { timeout: 15_000 })
      expect((await authCookieNames(liveContext)).length).toBeGreaterThan(0)
    } finally {
      await liveContext.close()
    }

    const victim = await createLinkStudent({ slot: 'rt-ij-deactivated' })
    const victimLink = await issueSetPasswordLink(victim.email)
    await softDeleteLinkStudent(victim.userId)

    const victimContext = await freshContext(browser)
    try {
      const victimPage = await victimContext.newPage()
      await victimPage.goto(victimLink.path)
      await submitNewPassword(victimPage, NEW_PASSWORD)
      await expect(victimPage.locator(`a[href="${FORGOT_PASSWORD_PATH}"]`).first()).toBeVisible({
        timeout: 15_000,
      })

      expect(await authCookieNames(victimContext)).toEqual([])
      await victimPage.goto('/app/dashboard')
      await victimPage.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })
    } finally {
      await victimContext.close()
    }
  })

  test('(Vector IK) a link spent on a failed password write keeps the session pinned to reset-password', async ({
    page,
    browser,
  }) => {
    const { userId, email } = await createLinkStudent({ slot: 'rt-ik-same-password' })
    await setKnownPassword(userId, OLD_PASSWORD)
    const { path } = await issueSetPasswordLink(email)

    await page.goto(path)
    // Auth rejects the write (same_password) AFTER verifyOtp has spent the token.
    await submitNewPassword(page, OLD_PASSWORD)
    await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible({ timeout: 15_000 })

    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name === RECOVERY_PENDING_COOKIE && c.value === '1')).toBe(true)
    expect((await authCookieNames(page.context())).length).toBeGreaterThan(0)

    await page.goto('/app/dashboard')
    await page.waitForURL('**/auth/reset-password', { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/auth/reset-password')

    // CONTROL: the same session without the pin cookie reaches /app — the pin is what blocks.
    const unpinned = await freshContext(browser)
    try {
      await unpinned.addCookies(cookies.filter((c) => c.name !== RECOVERY_PENDING_COOKIE))
      const unpinnedPage = await unpinned.newPage()
      await unpinnedPage.goto('/app/dashboard')
      await unpinnedPage.waitForURL('**/app/dashboard', { timeout: 15_000 })
      expect(new URL(unpinnedPage.url()).pathname).toBe('/app/dashboard')
    } finally {
      await unpinned.close()
    }
  })
})
