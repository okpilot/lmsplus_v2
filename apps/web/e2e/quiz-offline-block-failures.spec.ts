import { expect, type Page, test } from '@playwright/test'
import {
  clearQuizActiveSessionKeys,
  isServerActionPost,
  readServerAnsweredCount,
  startStudyQuiz,
  submitFirstOption,
} from './helpers/quiz-session'
import { cleanupStudentActiveSessions, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/user.json' })

const ATTEMPT_TIMEOUT_MS = 15_000
const STALL_ESCAPE_MS = 60_000
const AUTH_USER_URL = '**/auth/v1/user'

/** Holds every Server Action POST until `release()`; counts them. */
async function holdActionPosts(page: Page) {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const state = { posts: 0, release: () => release() }
  const handler = async (route: import('@playwright/test').Route) => {
    if (!isServerActionPost(route.request())) return route.fallback()
    state.posts += 1
    await gate
    return route.continue()
  }
  await page.route('**/app/quiz/session**', handler)
  return { state, stop: () => page.unroute('**/app/quiz/session**', handler) }
}

test.describe('Quiz connection block: failures that are not a dropped link', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.setOffline(false)
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('a slow save with the link up shows still saving, sends the answer once and saves it', async ({
    page,
  }) => {
    await page.clock.install()
    await startStudyQuiz(page)
    const held = await holdActionPosts(page)

    await submitFirstOption(page)
    await expect.poll(() => held.state.posts).toBe(1)
    await page.clock.fastForward(ATTEMPT_TIMEOUT_MS + 1000)

    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Still saving…')).toBeVisible({ timeout: 10_000 })
    expect(await readServerAnsweredCount()).toBe(0)

    held.state.release()
    await expect(overlay).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText('Saved ✓')).toBeVisible({ timeout: 10_000 })
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    expect(held.state.posts).toBe(1)
    await held.stop()
  })

  test('a server error with the link up shows an inline error without the connection block, and a retry saves', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    let failed = false
    await page.route('**/app/quiz/session**', async (route) => {
      if (!isServerActionPost(route.request()) || failed) return route.fallback()
      failed = true
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
    })

    await submitFirstOption(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Failed to check answer' })).toBeVisible(
      { timeout: 10_000 },
    )
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(await readServerAnsweredCount()).toBe(0)

    await submitFirstOption(page)
    await expect(page.getByRole('button', { name: 'Submit Answer' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    expect(failed).toBe(true)
  })

  test('an auth server outage during a server error is not treated as offline', async ({
    page,
  }) => {
    await startStudyQuiz(page)
    let authProbes = 0
    await page.route(AUTH_USER_URL, (route) => {
      authProbes += 1
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    })
    await page.route('**/app/quiz/session**', (route) => {
      if (!isServerActionPost(route.request())) return route.fallback()
      return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
    })

    await submitFirstOption(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Failed to check answer' })).toBeVisible(
      { timeout: 15_000 },
    )
    await expect(page.getByText('Connection lost — reconnecting…')).toHaveCount(0)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(authProbes).toBeGreaterThan(0)
    expect(await readServerAnsweredCount()).toBe(0)
  })
})

test.describe('Quiz connection block: sign-in expiry, finishing and leaving', () => {
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterEach(async ({ page, context }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await context.setOffline(false)
    await clearQuizActiveSessionKeys(page)
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test('an expired sign-in blocks the quiz, leaves without a prompt, and signing in again resumes the session', async ({
    page,
    context,
  }) => {
    const total = await startStudyQuiz(page)
    // Question 1 is saved first, so the tab holds a local checkpoint to resume from.
    await submitFirstOption(page)
    await expect.poll(readServerAnsweredCount, { timeout: 10_000 }).toBe(1)
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(page.getByText(`Question 2 of ${total}`)).toBeVisible()
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type())
      void dialog.accept()
    })

    await context.clearCookies()
    await submitFirstOption(page)

    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Your sign-in has expired')).toBeVisible({ timeout: 20_000 })
    await expect(
      overlay.getByText(
        'Sign in again to continue. Answers not yet saved will need to be entered again.',
      ),
    ).toBeVisible()
    expect(await readServerAnsweredCount()).toBe(1)

    await overlay.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/\?next=/, { timeout: 15_000 })
    const next = new URL(page.url()).searchParams.get('next')
    expect(next).toBe('/app/quiz/session')
    expect(page.url()).toContain(`next=${encodeURIComponent('/app/quiz/session')}`)
    expect(dialogs).not.toContain('beforeunload')

    await page.getByLabel('Email address').fill(TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/quiz/session', { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Resume your quiz?' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByText(/Question \d+ of /)).toBeVisible({ timeout: 10_000 })
    expect(await readServerAnsweredCount()).toBe(1)
  })

  test('finishing while an answer is still being saved counts that answer in the report', async ({
    page,
  }) => {
    const total = await startStudyQuiz(page)
    const held = await holdActionPosts(page)

    await submitFirstOption(page)
    await expect.poll(() => held.state.posts).toBe(1)
    await page.getByRole('button', { name: 'Finish Test' }).click()
    await expect(page.getByRole('dialog', { name: 'Finish quiz' })).toBeVisible()
    await page.getByRole('button', { name: 'Submit Quiz' }).click()
    await page.getByRole('button', { name: 'Submit anyway' }).click()

    // The finish waits behind the unsent save: still on the session page, one POST so far.
    await expect(page.getByRole('button', { name: 'Submitting...' }).first()).toBeVisible()
    expect(held.state.posts).toBe(1)
    await expect(page).toHaveURL(/\/app\/quiz\/session$/)

    held.state.release()
    await page.waitForURL('**/app/quiz/report**', { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible()
    // The held answer is in the report: one question in the breakdown, the rest skipped.
    await expect(page.getByText('1 question', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Skipped', { exact: true }).first().locator('xpath=..'),
    ).toContainText(String(total - 1))
    await held.stop()
  })

  test('after a minute offline the quiz offers a reload with a warning about unsent answers', async ({
    page,
    context,
  }) => {
    await page.clock.install()
    await startStudyQuiz(page)
    await context.setOffline(true)
    await submitFirstOption(page)

    const overlay = page.getByRole('alertdialog')
    await expect(overlay.getByText('Connection lost — reconnecting…')).toBeVisible({
      timeout: 10_000,
    })
    await expect(overlay.getByRole('button', { name: 'Reload page' })).toHaveCount(0)

    await page.clock.fastForward(STALL_ESCAPE_MS + 1000)
    await expect(
      overlay.getByText('Still waiting? Reloading loses answers not yet sent.'),
    ).toBeVisible()
    await expect(overlay.getByRole('button', { name: 'Reload page' })).toBeVisible()

    await context.setOffline(false)
    await page.clock.fastForward(15_000)
    await expect(overlay).toBeHidden({ timeout: 20_000 })
    await expect.poll(readServerAnsweredCount, { timeout: 15_000 }).toBe(1)
  })

  test('leaving while an answer is unsent asks for confirmation and stays on the quiz when declined', async ({
    page,
    context,
  }) => {
    await startStudyQuiz(page)
    await context.setOffline(true)
    await submitFirstOption(page)
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 })

    const dialogPromise = page.waitForEvent('dialog', { timeout: 10_000 })
    await page.close({ runBeforeUnload: true })
    const dialog = await dialogPromise
    expect(dialog.type()).toBe('beforeunload')
    await dialog.dismiss()

    expect(page.isClosed()).toBe(false)
    await expect(page).toHaveURL(/\/app\/quiz\/session$/)
  })
})
