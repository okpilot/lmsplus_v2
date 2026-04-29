import { expect, test as setup } from '@playwright/test'
import {
  ensureInternalExamStudentUser,
  INTERNAL_EXAM_STUDENT_EMAIL,
  INTERNAL_EXAM_STUDENT_PASSWORD,
} from './helpers/supabase'

const AUTH_FILE = 'e2e/.auth/internal-exam-student.json'

setup('create internal-exam student authenticated session', async ({ page }) => {
  await ensureInternalExamStudentUser()

  await page.goto('/')
  await page.getByLabel('Email address').fill(INTERNAL_EXAM_STUDENT_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(INTERNAL_EXAM_STUDENT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  await page.context().storageState({ path: AUTH_FILE })
})
