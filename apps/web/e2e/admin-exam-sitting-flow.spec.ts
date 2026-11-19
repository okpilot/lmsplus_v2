/**
 * E2E spec: one sitting from creation to closing, admin and student side by side.
 *
 * Uses `e2e/.auth/admin.json` and the internal-exam student state (`e2e/.auth/internal-exam-student.json`);
 * the student types the issued code in the code-entry modal. Two further students are seeded (`e2e-sit-` emails).
 */
import { type BrowserContext, expect as baseExpect, type Page, test } from '@playwright/test'
import { getAdminOrganizationId, signInAsAdmin } from './helpers/admin-supabase'
import { cleanupCreatedExamConfigs, ensureExamConfigs } from './helpers/exam-config-cleanup'
import { cleanupE2eExamSittings, markE2eSitting } from './helpers/exam-sitting-cleanup'
import {
  claimSittingForCleanup,
  ensureEnrolled,
  findSubject,
  readSittingCodes,
  runCleanupSteps,
  seedEnrolledStudents,
} from './helpers/exam-sitting-flow-seed'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

// A dev server compiles each route on first open: generous timeouts, never sleeps.
const expect = baseExpect.configure({ timeout: 25_000 })

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })
test.setTimeout(240_000)

const LIST = '/app/admin/internal-exams'
const SITTING_URL = /\/app\/admin\/internal-exams\/sittings\/[0-9a-f-]{36}$/

const loadedAt = new Date()
test.skip(
  loadedAt.getUTCHours() === 23 && loadedAt.getUTCMinutes() >= 55,
  'UTC day rollover window',
)

test.beforeEach(async () => {
  await cleanupInternalExamStudentActiveSessions(await signInAsAdmin())
  await cleanupE2eExamSittings()
  await ensureExamConfigs(await getAdminOrganizationId())
})

test.afterEach(async () => {
  await runCleanupSteps([
    cleanupE2eExamSittings,
    async () => cleanupInternalExamStudentActiveSessions(await signInAsAdmin()),
    cleanupCreatedExamConfigs,
  ])
})

const todayUtc = () => new Date().toISOString().slice(0, 10)
const personRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const popup = (page: Page) => page.getByRole('dialog')
const confirmDialog = (page: Page) => page.getByRole('alertdialog')

/** "19 Nov 2026": the format the student page prints a date in. */
function utcDay(): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date())
}

async function createSittingToday(page: Page): Promise<string> {
  await page.goto(`${LIST}?tab=sittings`)
  await page.getByRole('button', { name: /New sitting/ }).click()
  await expect(page).toHaveURL(/dlg=new/)
  await page.getByLabel('Date and time (UTC)').fill(`${todayUtc()}T23:58`)
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page
    .getByRole('option', { name: /\((admin|instructor)\)$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(SITTING_URL, { timeout: 30_000 })
  const id = new URL(page.url()).pathname.split('/').pop() ?? ''
  await markE2eSitting(id)
  await claimSittingForCleanup(id)
  return id
}

async function addPerson(page: Page, search: string, name: string, banner: string) {
  await page.getByRole('button', { name: 'Add people' }).first().click()
  await expect(popup(page).getByRole('heading', { name: 'Add people' })).toBeVisible()
  await popup(page).getByLabel('Search name or email').fill(search)
  await popup(page)
    .getByRole('checkbox', { name: `Select ${name}` })
    .click()
  await popup(page).getByRole('button', { name: 'Add selected (1)' }).click()
  await expect(popup(page)).toHaveCount(0)
  await expect(page.getByText(banner).first()).toBeVisible()
  await expect(personRow(page, name)).toBeVisible()
}

async function issueAll(page: Page, count: number) {
  const noun = count === 1 ? 'code' : 'codes'
  const students = count === 1 ? 'student' : 'students'
  await page.getByRole('button', { name: `Issue all codes (${count})` }).click()
  await expect(
    popup(page).getByText(`Will issue ${count} ${noun} for ${count} ${students}.`),
  ).toBeVisible()
  await popup(page)
    .getByRole('button', { name: `Issue ${count} ${noun}` })
    .click()
  await expect(popup(page)).toHaveCount(0)
  await expect(page.getByText(`Issued ${count} ${noun}.`).first()).toBeVisible()
}

/** Answers and confirms every question of the running exam. */
async function answerAll(page: Page) {
  const options = page.locator('button[data-testid^="option-"]')
  const next = page.getByRole('button', { name: /^Next/ })
  for (let i = 0; i < 60; i++) {
    await options.first().click()
    await page.getByRole('button', { name: 'Confirm Answer' }).click()
    await expect(options.first()).toBeDisabled()
    if (!(await next.isEnabled())) return
    await next.click()
  }
  throw new Error('exam has more than 60 questions')
}

async function startExam(page: Page, code: string) {
  await page.getByTestId('start-button').first().click()
  await page.getByTestId('code-input').fill(code)
  await page.getByRole('button', { name: 'Start exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 30_000 })
  await expect(page.getByText(/Question \d/)).toBeVisible()
}

async function finishExam(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Finish Internal Exam' }).click()
  await page.getByRole('button', { name: 'Submit Internal Exam' }).click()
  await page
    .getByRole('button', { name: 'Submit anyway' })
    .click({ timeout: 3_000 })
    .catch(() => {})
  await page.waitForURL(/\/app\/internal-exam\/report\?session=/, { timeout: 30_000 })
  return new URL(page.url()).searchParams.get('session') ?? ''
}

async function openStudentContext(browser: BrowserContext['browser']) {
  if (!browser) throw new Error('browser is null')
  const context = await browser.newContext({ storageState: 'e2e/.auth/internal-exam-student.json' })
  return { context, page: await context.newPage() }
}

async function readStudent() {
  const res = await getAdminClient()
    .from('users')
    .select('id, full_name, email')
    .eq('email', INTERNAL_EXAM_STUDENT_EMAIL)
    .single()
  if (res.error || !res.data) throw new Error(`student lookup: ${res.error?.message}`)
  return { id: res.data.id, name: res.data.full_name?.trim() || res.data.email }
}

test('a sitting runs from creation to closing: codes, student attempt, late add, close', async ({
  page,
  context: adminCtx,
}) => {
  const subject = await findSubject('Meteorology')
  const student = await readStudent()
  await ensureEnrolled(student.id, subject.courseId)
  const [bea, cy] = await seedEnrolledStudents(['E2E Flow Bea', 'E2E Flow Cy'], subject.courseId)
  if (!bea || !cy) throw new Error('seed students')
  const sittingId = await createSittingToday(page)
  const { context: studentCtx, page: studentPage } = await openStudentContext(adminCtx.browser())

  try {
    await test.step('add the student and Bea', async () => {
      await addPerson(page, student.name, student.name, 'Added 1 person.')
      await addPerson(page, 'E2E Flow Bea', 'E2E Flow Bea', 'Added 1 person.')
    })

    await test.step('add the Meteorology exam for both and issue two codes', async () => {
      await page.getByRole('checkbox', { name: `Select ${student.name}` }).click()
      await page.getByRole('checkbox', { name: 'Select E2E Flow Bea' }).click()
      await page.getByRole('button', { name: 'Add exams' }).click()
      await expect(
        popup(page).getByRole('heading', { name: 'Add exams for 2 people' }),
      ).toBeVisible()
      await popup(page)
        .getByRole('checkbox', { name: `Add ${subject.short}` })
        .click()
      await expect(popup(page).getByRole('status')).toContainText('1 exam for 2 people')
      await popup(page).getByRole('button', { name: 'Add exams' }).click()
      await expect(popup(page)).toHaveCount(0)
      await expect(page.getByText('Added 2 exams.').first()).toBeVisible()
      await page.getByRole('button', { name: 'Clear' }).click()
      await issueAll(page, 2)
      await expect(personRow(page, student.name)).toContainText('Ready')
    })

    await test.step('the student sees the sitting with Start disabled and the reason', async () => {
      await studentPage.goto('/app/internal-exam')
      const row = studentPage.getByTestId('available-list').getByRole('listitem').first()
      await expect(row).toContainText(`${utcDay()}, 23:58 UTC · Remote`)
      await expect(row.getByText('Opens when your invigilator starts the sitting.')).toBeVisible()
      await expect(row.getByTestId('start-button')).toBeDisabled()
    })

    await test.step('a late person and exam get the only new code', async () => {
      await addPerson(page, 'E2E Flow Cy', 'E2E Flow Cy', 'Added 1 person.')
      await page.getByRole('button', { name: 'Actions for E2E Flow Cy' }).click()
      await page.getByRole('menuitem', { name: 'Add exams' }).click()
      await popup(page)
        .getByRole('checkbox', { name: `Add ${subject.short}` })
        .click()
      await popup(page).getByRole('button', { name: 'Add exams' }).click()
      await expect(page.getByText('Added 1 exam.').first()).toBeVisible()
      await issueAll(page, 1)
      await expect(personRow(page, 'E2E Flow Cy')).toContainText('Ready')
    })

    const codes = await readSittingCodes(sittingId)
    const codeOf = (userId: string) => codes.find((c) => c.userId === userId)?.code ?? ''
    expect(codes).toHaveLength(3)

    await test.step('the admin starts the sitting', async () => {
      await page.getByRole('button', { name: 'Start sitting' }).click()
      await expect(confirmDialog(page).getByText('Start sitting?')).toBeVisible()
      await expect(confirmDialog(page).getByText(/no code yet/)).toHaveCount(0)
      await confirmDialog(page).getByRole('button', { name: 'Start sitting' }).click()
      await expect(page.getByText('Sitting started.').first()).toBeVisible()
      await expect(page.getByText(/^Open · /)).toBeVisible()
    })

    let sessionId = ''
    await test.step('the student reloads, types the code, answers every question and finishes', async () => {
      await studentPage.reload()
      const row = studentPage.getByTestId('available-list').getByRole('listitem').first()
      await expect(row.getByText('Works while the sitting is open.')).toBeVisible()
      await expect(row.getByTestId('start-button')).toBeEnabled()
      await startExam(studentPage, codeOf(student.id))
      await answerAll(studentPage)
      sessionId = await finishExam(studentPage)
      await expect(studentPage.getByText('Internal Exam Complete')).toBeVisible()
      await expect(studentPage.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
      await expect(
        studentPage.getByRole('img', { name: /^(Correct|Incorrect)$/ }).first(),
      ).toBeVisible()
    })

    await test.step('with an attempt taken: no Remove for that student, Remove for the others, Cancel refused', async () => {
      await page.reload()
      await expect(personRow(page, student.name)).toContainText('Done')
      await page.getByRole('button', { name: `Actions for ${student.name}` }).click()
      await expect(page.getByRole('menuitem', { name: 'Add exams' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Remove from sitting' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Actions for E2E Flow Bea' }).click()
      await expect(page.getByRole('menuitem', { name: 'Remove from sitting' })).toBeVisible()
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'More actions' }).click()
      await page.getByRole('menuitem', { name: 'Cancel sitting' }).click()
      await confirmDialog(page).getByRole('button', { name: 'Cancel sitting' }).click()
      await expect(
        confirmDialog(page).getByText('A candidate has already taken an exam in this sitting.'),
      ).toBeVisible()
      await confirmDialog(page).getByRole('button', { name: 'Keep sitting' }).click()
      await expect(confirmDialog(page)).toHaveCount(0)
      await expect(page.getByText(/^Open · /)).toBeVisible()
    })

    await test.step('Close counts the two who did not start, then marks them absent', async () => {
      await page.getByRole('button', { name: 'Close sitting' }).click()
      await expect(confirmDialog(page).getByText('Close sitting?')).toBeVisible()
      await expect(
        confirmDialog(page).getByText(
          '2 exams (2 students) have not started: they will be marked absent and their codes voided. A closed sitting cannot be reopened.',
        ),
      ).toBeVisible()
      await confirmDialog(page).getByRole('button', { name: 'Close sitting' }).click()
      await expect(page.getByText('Sitting closed.').first()).toBeVisible()
      await expect(page.getByText('2 codes voided, 0 running, 2 absent.')).toBeVisible()
      await expect(page.getByText(/^Closed · /)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add people' })).toHaveCount(0)
      await page.reload()
      await expect(personRow(page, 'E2E Flow Bea')).toContainText('Absent')
      await expect(personRow(page, 'E2E Flow Cy')).toContainText('Absent')
      await expect(personRow(page, student.name)).not.toContainText('Absent')
      await page.getByRole('button', { name: 'Show exams for E2E Flow Bea' }).click()
      await expect(page.getByText('Did not start')).toBeVisible()
    })

    await test.step('the two unused codes are voided and the attempt is in Attempts', async () => {
      const after = await readSittingCodes(sittingId)
      expect(
        after
          .filter((c) => c.voided)
          .map((c) => c.userId)
          .sort(),
      ).toEqual([bea.userId, cy.userId].sort())
      await page.goto(`${LIST}?tab=codes&status=voided`)
      for (const id of [bea.userId, cy.userId]) {
        await expect(page.getByRole('row').filter({ hasText: codeOf(id) })).toContainText('Voided')
      }
      await page.goto(`${LIST}?tab=attempts`)
      await page.locator(`a[href="${LIST}/report?session=${sessionId}"]`).click()
      await expect(page.getByRole('heading', { name: 'Question Breakdown' })).toBeVisible()
    })
  } finally {
    await studentCtx.close()
  }
})
