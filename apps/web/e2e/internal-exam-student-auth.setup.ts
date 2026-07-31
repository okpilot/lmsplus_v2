import { expect, test as setup } from '@playwright/test'
import { signInAsAdmin } from './helpers/admin-supabase'
import {
  cleanupInternalExamStudentActiveSessions,
  ensureInternalExamStudentUser,
  INTERNAL_EXAM_STUDENT_EMAIL,
  INTERNAL_EXAM_STUDENT_PASSWORD,
} from './helpers/supabase'

const AUTH_FILE = 'e2e/.auth/internal-exam-student.json'

setup('create internal-exam student authenticated session', async ({ page }) => {
  await ensureInternalExamStudentUser()

  // Do NOT call ensureAdminTestUser() here. It unconditionally resets the admin
  // password, and that revokes every existing admin session — including the one
  // admin-auth.setup.ts already wrote to e2e/.auth/admin.json, which sends every
  // admin-e2e spec to the login page. The admin user (and its role/org repair and
  // consent records) is instead guaranteed by this project's
  // `dependencies: ['admin-setup']` in playwright.config.ts.

  // Void any active session left over from a prior run before the suite starts.
  // See issue #587 — stale sessions cascade across tests.
  const adminClient = await signInAsAdmin()
  await cleanupInternalExamStudentActiveSessions(adminClient)

  await page.goto('/')
  await page.getByLabel('Email address').fill(INTERNAL_EXAM_STUDENT_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(INTERNAL_EXAM_STUDENT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.context().storageState({ path: AUTH_FILE })
})
