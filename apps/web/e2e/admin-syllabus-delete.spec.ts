import { expect, test } from '@playwright/test'
import {
  cleanupE2eSyllabus,
  getSubjectDeletedAt,
  makeSyllabusE2eCode,
} from './helpers/syllabus-cleanup'

test.use({ storageState: 'e2e/.auth/admin.json' })

test.afterEach(async () => {
  await cleanupE2eSyllabus()
})

test.describe('Admin Syllabus — soft delete', () => {
  test('admin adds a subject, deletes it, and it stays gone after reload with its row kept', async ({
    page,
  }) => {
    const code = makeSyllabusE2eCode()
    const name = `E2E subject ${code}`

    await page.goto('/app/admin/syllabus')
    await expect(page).toHaveURL(/\/app\/admin\/syllabus$/)
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()

    await page.getByLabel('e.g. 010').fill(code)
    await page.getByLabel('Subject name').fill(name)
    await page.getByLabel('Short name').fill('E2E')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(`Subject "${code}" added`)).toBeVisible()

    const row = page.locator('div.rounded-control', { hasText: name })
    await expect(row).toBeVisible()

    await page.reload()
    await expect(page).toHaveURL(/\/app\/admin\/syllabus$/)
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Its history is kept.')
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(`Deleted "${code} - ${name}"`)).toBeVisible()
    await expect(row).toHaveCount(0)

    await page.reload()
    await expect(page).toHaveURL(/\/app\/admin\/syllabus$/)
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await expect(page.getByText(name)).toHaveCount(0)

    expect(await getSubjectDeletedAt(code)).toEqual(expect.any(String))
  })

  test('cleanup helper is a no-op when no marked subject is active', async () => {
    expect(await cleanupE2eSyllabus()).toBe(0)
  })
})
