import { expect, type Locator, type Page, test } from '@playwright/test'
import { cleanupE2eSyllabus, newE2eSubjectCode } from './helpers/syllabus-cleanup'

test.use({ storageState: 'e2e/.auth/admin.json' })

type Names = {
  code: string
  subject: string
  topicCode: string
  topic: string
  subtopicCode: string
  subtopic: string
}

function namesFor(code: string): Names {
  return {
    code,
    subject: `Syllabus Subject ${code}`,
    topicCode: `${code}-T1`,
    topic: `Syllabus Topic ${code}`,
    subtopicCode: `${code}-T1-S1`,
    subtopic: `Syllabus Subtopic ${code}`,
  }
}

async function addSubject(page: Page, n: Names): Promise<void> {
  await page.getByRole('textbox', { name: 'e.g. 010' }).fill(n.code)
  await page.getByRole('textbox', { name: 'Subject name' }).fill(n.subject)
  await page.getByRole('textbox', { name: 'Short name' }).fill('E2E')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
}

/** A subject's collapsible root: the header row plus its (lazy) children panel. */
function subjectRoot(page: Page, n: Names): Locator {
  return page.getByRole('button', { name: `Toggle ${n.code} ${n.subject}` }).locator('../..')
}

function topicRoot(page: Page, n: Names): Locator {
  return page.getByRole('button', { name: `Toggle ${n.topicCode} ${n.topic}` }).locator('../..')
}

/**
 * Waits until the client has hydrated: a seeded subject trigger flips `aria-expanded` on click.
 * Clicks before hydration are lost, so retry; the flip is restored afterwards.
 */
async function waitForHydration(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: /^Toggle 050 / })
  await expect(async () => {
    const before = await trigger.getAttribute('aria-expanded')
    await trigger.click()
    await expect(trigger).not.toHaveAttribute('aria-expanded', before ?? '', { timeout: 500 })
  }).toPass()
  if ((await trigger.getAttribute('aria-expanded')) === 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
}

async function toggle(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name })
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
}

/** Builds subject → topic → subtopic through the UI and leaves both levels expanded. */
async function createHierarchy(page: Page, n: Names): Promise<void> {
  await addSubject(page, n)
  await expect(page.getByText(`Subject "${n.code}" added`)).toBeVisible()
  await toggle(page, `Toggle ${n.code} ${n.subject}`)

  const subject = subjectRoot(page, n)
  await subject.getByRole('textbox', { name: 'Topic code', exact: true }).fill(n.topicCode)
  await subject.getByRole('textbox', { name: 'Topic name', exact: true }).fill(n.topic)
  await subject.getByRole('button', { name: 'Add', exact: true }).first().click()
  await expect(page.getByText(`Topic "${n.topicCode}" added`)).toBeVisible()
  await toggle(page, `Toggle ${n.topicCode} ${n.topic}`)

  const topic = topicRoot(page, n)
  await topic.getByRole('textbox', { name: 'Subtopic code', exact: true }).fill(n.subtopicCode)
  await topic.getByRole('textbox', { name: 'Subtopic name', exact: true }).fill(n.subtopic)
  await topic.getByRole('button', { name: 'Add', exact: true }).first().click()
  await expect(page.getByText(`Subtopic "${n.subtopicCode}" added`)).toBeVisible()
  await expect(topic.getByText(n.subtopic, { exact: true })).toBeVisible()
}

async function expandAll(page: Page, n: Names): Promise<void> {
  await toggle(page, `Toggle ${n.code} ${n.subject}`)
  await toggle(page, `Toggle ${n.topicCode} ${n.topic}`)
}

test.describe('Admin Syllabus Manager', () => {
  test.setTimeout(90_000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/app/admin/syllabus')
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await waitForHydration(page)
  })

  // Syllabus tables have no deleted_at; rows carry the E2E- code marker and are hard-deleted here.
  test.afterEach(async () => {
    await cleanupE2eSyllabus()
  })

  test('adds a subject, topic and subtopic that survive a reload', async ({ page }) => {
    const n = namesFor(newE2eSubjectCode())

    await createHierarchy(page, n)

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await waitForHydration(page)
    await expect(page.getByRole('button', { name: `Toggle ${n.code} ${n.subject}` })).toBeVisible()
    await expandAll(page, n)
    await expect(topicRoot(page, n).getByText(n.subtopic, { exact: true })).toBeVisible()
  })

  test('edits the subject, topic and subtopic names and keeps them after a reload', async ({
    page,
  }) => {
    const n = namesFor(newE2eSubjectCode())
    await createHierarchy(page, n)

    const subjectHeader = page
      .getByRole('button', { name: `Toggle ${n.code} ${n.subject}` })
      .locator('..')
    await subjectHeader.getByRole('button', { name: 'Edit subject' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${n.subject} edited`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`Subject "${n.code}" updated`)).toBeVisible()
    const editedSubject = `${n.subject} edited`

    const topicHeader = page
      .getByRole('button', { name: `Toggle ${n.topicCode} ${n.topic}` })
      .locator('..')
    await topicHeader.getByRole('button', { name: 'Edit topic' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${n.topic} edited`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`Topic "${n.topicCode}" updated`)).toBeVisible()
    // Editing the subject renders InlineForm instead of Collapsible, which unmounts TopicRow and
    // drops its open state; reopen the topic to reach its subtopics.
    await toggle(page, `Toggle ${n.topicCode} ${n.topic} edited`)

    const subtopicRow = page.getByText(n.subtopic, { exact: true }).locator('..')
    await subtopicRow.getByRole('button', { name: 'Edit subtopic' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${n.subtopic} edited`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(`Subtopic "${n.subtopicCode}" updated`)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await waitForHydration(page)
    await toggle(page, `Toggle ${n.code} ${editedSubject}`)
    await toggle(page, `Toggle ${n.topicCode} ${n.topic} edited`)
    await expect(page.getByText(`${n.subtopic} edited`, { exact: true })).toBeVisible()
    await expect(page.getByText(n.subtopic, { exact: true })).toHaveCount(0)
  })

  test('deletes a subtopic, topic and subject only after the confirmation dialog', async ({
    page,
  }) => {
    const n = namesFor(newE2eSubjectCode())
    await createHierarchy(page, n)

    const subtopicRow = page.getByText(n.subtopic, { exact: true }).locator('..')
    await subtopicRow.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByText(`Delete ${n.subtopicCode} - ${n.subtopic}?`)).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(n.subtopic, { exact: true })).toBeVisible()

    await subtopicRow.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(`Deleted "${n.subtopicCode} - ${n.subtopic}"`)).toBeVisible()
    await expect(page.getByText(n.subtopic, { exact: true })).toHaveCount(0)

    const topicHeader = page
      .getByRole('button', { name: `Toggle ${n.topicCode} ${n.topic}` })
      .locator('..')
    await topicHeader.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(`Deleted "${n.topicCode} - ${n.topic}"`)).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Toggle ${n.topicCode} ${n.topic}` }),
    ).toHaveCount(0)

    const subjectHeader = page
      .getByRole('button', { name: `Toggle ${n.code} ${n.subject}` })
      .locator('..')
    await subjectHeader.getByRole('button', { name: 'Delete', exact: true }).click()
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText(`Deleted "${n.code} - ${n.subject}"`)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await waitForHydration(page)
    // Non-vacuous: seeded subjects still render, so the absence below is not an empty page.
    await expect(page.getByRole('button', { name: /^Toggle 050 / })).toBeVisible()
    await expect(page.getByRole('button', { name: `Toggle ${n.code} ${n.subject}` })).toHaveCount(0)
  })

  test('refuses a second subject with an existing code and keeps a single row', async ({
    page,
  }) => {
    const n = namesFor(newE2eSubjectCode())
    await addSubject(page, n)
    await expect(page.getByText(`Subject "${n.code}" added`)).toBeVisible()
    const toggleButton = page.getByRole('button', { name: `Toggle ${n.code} ${n.subject}` })
    await expect(toggleButton).toBeVisible()

    await addSubject(page, { ...n, subject: `${n.subject} duplicate` })

    await expect(page.getByText('A subject with this code already exists')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Syllabus Manager' })).toBeVisible()
    await waitForHydration(page)
    await expect(toggleButton).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: `Toggle ${n.code} ${n.subject} duplicate` }),
    ).toHaveCount(0)
  })
})
