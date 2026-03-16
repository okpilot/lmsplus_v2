import { expect, test as setup } from '@playwright/test'
import { clearAllMessages, extractMagicLink, getLatestEmail } from './helpers/mailpit'
import { ensureTestUser, TEST_EMAIL } from './helpers/supabase'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('create authenticated session', async ({ page }) => {
  // 1. Ensure the test user exists
  await ensureTestUser()
  await clearAllMessages(TEST_EMAIL)

  // 2. Go through the real login flow to get proper PKCE cookies
  await page.goto('/')
  await page.getByLabel('Email address').fill(TEST_EMAIL)
  await page.getByRole('button', { name: 'Send magic link' }).click()

  // 3. Wait for verify page (allow extra time in CI for Supabase OTP call)
  await page.waitForURL('/auth/verify', { timeout: 15_000 })

  // 4. Fetch magic link from Inbucket
  const email = await getLatestEmail(TEST_EMAIL)
  const magicLink = extractMagicLink(email.HTML)

  // 5. Visit the magic link — goes through Supabase PKCE flow → callback → dashboard
  await page.goto(magicLink)
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // 6. Save the authenticated state
  await page.context().storageState({ path: AUTH_FILE })
})
