import { expect, test } from '@playwright/test'
import {
  countActiveSubjectExamConfigs,
  softDeleteSubjectExamConfigs,
} from './helpers/exam-config-cleanup'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_CODE = '100'
const SUBTOPIC_CODES = Array.from(
  { length: 11 },
  (_, i) => `100-04-${String(i + 1).padStart(2, '0')}`,
)

let testStart = ''

test.beforeEach(async () => {
  testStart = new Date().toISOString()
  expect(
    await countActiveSubjectExamConfigs(SUBJECT_CODE),
    'local DB already has an active subject-100 exam config; the spec would overwrite it',
  ).toBe(0)
})

test.afterEach(async () => {
  await softDeleteSubjectExamConfigs(SUBJECT_CODE, testStart)
})

test.describe('Admin Exam Config — sub-topic rows', () => {
  test('admin sets 2 per sub-topic for subject 100, saves, and reopening shows the 11 counts', async ({
    page,
  }) => {
    await page.goto('/app/admin/exam-config')
    await expect(page.getByRole('heading', { name: 'Exam Configuration' })).toBeVisible()

    await page.getByRole('button', { name: /Knowledge, Skills and Attitudes/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('100')

    await dialog.getByLabel('Total Questions').fill('22')
    for (const code of SUBTOPIC_CODES) {
      await dialog.getByLabel(`${code} questions`).fill('2')
    }
    await expect(dialog.getByText(/Total: 22 \/ 22/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Save Config' }).click()
    await expect(dialog).toBeHidden()

    await page.reload()
    await page.getByRole('button', { name: /Knowledge, Skills and Attitudes/ }).click()
    const reopened = page.getByRole('dialog')
    for (const code of SUBTOPIC_CODES) {
      await expect(reopened.getByLabel(`${code} questions`)).toHaveValue('2')
    }
  })
})
