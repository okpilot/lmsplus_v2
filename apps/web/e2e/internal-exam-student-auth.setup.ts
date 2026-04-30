import { expect, test as setup } from '@playwright/test'
import { ensureAdminTestUser, signInAsAdmin } from './helpers/admin-supabase'
import {
  cleanupInternalExamStudentActiveSessions,
  ensureInternalExamStudentUser,
  INTERNAL_EXAM_STUDENT_EMAIL,
  INTERNAL_EXAM_STUDENT_PASSWORD,
} from './helpers/supabase'

const AUTH_FILE = 'e2e/.auth/internal-exam-student.json'

setup('create internal-exam student authenticated session', async ({ page }) => {
  await ensureInternalExamStudentUser()
  // Self-contained: ensure the admin user exists before signInAsAdmin().
  // Playwright does not order setup projects without explicit dependencies, so
  // this project may run before admin-setup. On a fresh CI DB the admin auth
  // user wouldn't exist yet → "Invalid login credentials".
  await ensureAdminTestUser()

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
