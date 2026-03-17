import { expect, test as setup } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { ensureTestUser, TEST_EMAIL, TEST_PASSWORD } from './helpers/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required for E2E tests')

const AUTH_FILE = 'e2e/.auth/user.json'

setup('create authenticated session', async ({ page, context }) => {
  await ensureTestUser()

  // Sign in via Node Supabase client (not browser) to get session tokens
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })
  if (error || !data.session) throw new Error(`Auth setup sign-in failed: ${error?.message}`)

  // Build the cookie value in the same format @supabase/ssr uses: base64-<base64url JSON>
  const sessionJson = JSON.stringify(data.session)
  const base64Value = `base64-${Buffer.from(sessionJson).toString('base64url')}`

  // Cookie name: sb-<hostname_first_segment>-auth-token
  const hostname = new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'localhost'
  const cookieName = `sb-${hostname}-auth-token`

  // Inject the auth cookie directly into the browser context
  await context.addCookies([
    {
      name: cookieName,
      value: base64Value,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
    },
  ])

  // Verify the session works by navigating to a protected route
  await page.goto('/app/dashboard')
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await context.storageState({ path: AUTH_FILE })
})
