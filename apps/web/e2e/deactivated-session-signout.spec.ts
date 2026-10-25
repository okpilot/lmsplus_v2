import { expect, test } from '@playwright/test'
import {
  ensureLoginTestUser,
  getAdminClient,
  LOGIN_TEST_EMAIL,
  LOGIN_TEST_PASSWORD,
} from './helpers/supabase'

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 800 },
})

const INACTIVE_COPY =
  'Your account has been deactivated. Please contact your flight school administrator.'

test('a deactivated signed-in student is signed out on the next /app load and the cookie is cleared', async ({
  page,
}) => {
  await ensureLoginTestUser()
  const admin = getAdminClient()
  const { data: row, error: rowErr } = await admin
    .from('users')
    .select('id')
    .eq('email', LOGIN_TEST_EMAIL)
    .single()
  if (rowErr) throw new Error(`lookup login user: ${rowErr.message}`)

  try {
    await page.goto('/')
    await page.getByLabel('Email address').fill(LOGIN_TEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(LOGIN_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/app/dashboard', { timeout: 15_000 })

    const { error: banErr } = await admin.auth.admin.updateUserById(row.id, {
      ban_duration: '876600h',
    })
    if (banErr) throw new Error(`ban: ${banErr.message}`)
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', row.id)
    if (delErr) throw new Error(`deactivate: ${delErr.message}`)

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 15_000 })
    await expect(page.getByText(INACTIVE_COPY)).toBeVisible()

    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/')
  } finally {
    await admin.auth.admin.updateUserById(row.id, { ban_duration: 'none' })
    await admin.from('users').update({ deleted_at: null }).eq('id', row.id)
  }
})
