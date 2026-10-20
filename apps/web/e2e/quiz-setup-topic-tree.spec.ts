import { expect, test } from '@playwright/test'

test.use({ storageState: 'e2e/.auth/user.json' })

// Read-only spec: creates no rows, so it needs no marker or cleanup.
test.describe('Quiz setup topic tree', () => {
  async function openStudySubject(page: import('@playwright/test').Page) {
    await page.goto('/app/quiz')
    await page.getByRole('button', { name: 'Study', exact: true }).click()
    const trigger = page.getByTestId('subject-trigger')
    await trigger.waitFor({ state: 'visible' })
    await trigger.click()
    await page.getByTestId('subject-option').first().click()
  }

  test('selecting a subject in Study mode lists its topics, and they list again after reload', async ({
    page,
  }) => {
    await openStudySubject(page)
    await expect(page.getByText('Topics', { exact: true })).toBeVisible()
    const toggles = page.getByRole('button', { name: /^Toggle / })
    await expect(toggles.first()).toBeVisible()
    expect(await toggles.count()).toBeGreaterThan(0)

    await page.reload()
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await openStudySubject(page)
    await expect(page.getByRole('button', { name: /^Toggle / }).first()).toBeVisible()
  })

  test('expanding a topic reveals its subtopics', async ({ page }) => {
    await openStudySubject(page)
    const toggle = page.getByRole('button', { name: /^Toggle / }).first()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
