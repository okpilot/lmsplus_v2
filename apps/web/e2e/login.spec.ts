import { expect, test } from '@playwright/test'
import { clearAllMessages, extractMagicLink, getLatestEmail } from './helpers/mailpit'
import { TEST_EMAIL, ensureTestUser } from './helpers/supabase'

// Run without saved auth state — we want to test the full login flow
test.use({ storageState: { cookies: [], origins: [] } })

test('magic link login flow: email → verify → callback → dashboard', async ({ page }) => {
  await ensureTestUser()
  await clearAllMessages(TEST_EMAIL)

  // 1. Go to login page and enter email
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LMS Plus' })).toBeVisible()

  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByRole('button', { name: 'Send magic link' }).click()

  // 2. Should redirect to verify page
  await page.waitForURL('/auth/verify', { timeout: 10_000 })
  await expect(page.getByText('Check your email')).toBeVisible()

  // 3. Fetch magic link from Inbucket
  const email = await getLatestEmail(TEST_EMAIL)
  const magicLink = extractMagicLink(email.HTML)

  // 4. Visit the magic link — it goes through Supabase auth then to callback
  await page.goto(magicLink)

  // 5. Should end up on dashboard
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})
