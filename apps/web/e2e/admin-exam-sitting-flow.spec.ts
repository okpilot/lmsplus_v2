/**
 * E2E spec: one sitting from creation to closing, admin and student side by side.
 *
 * Uses `e2e/.auth/admin.json` and the internal-exam student state (`e2e/.auth/internal-exam-student.json`);
 * the student types the issued code in the code-entry modal. Two further students are seeded (`e2e-sit-` emails).
 */
import { type Browser, expect as baseExpect, type Page, test } from '@playwright/test'
import { getAdminOrganizationId, signInAsAdmin } from './helpers/admin-supabase'
import { cleanupCreatedExamConfigs, ensureExamConfigs } from './helpers/exam-config-cleanup'
import { cleanupE2eExamSittings, markSittingScheduledAt } from './helpers/exam-sitting-cleanup'
import {
  findSubject,
  readSittingCodes,
  restoreExamTimer,
  runCleanupSteps,
  seedEnrolledStudents,
  widenExamTimer,
} from './helpers/exam-sitting-flow-seed'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'
import { skipNearUtcRollover } from './helpers/utc-rollover'

// A dev server compiles each route on first open: generous timeouts, never sleeps.
const expect = baseExpect.configure({ timeout: 25_000 })

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })
test.setTimeout(240_000)

const LIST = '/app/admin/internal-exams'
const SITTING_URL = /\/app\/admin\/internal-exams\/sittings\/[0-9a-f-]{36}$/

test.beforeEach(async () => {
  skipNearUtcRollover()
  await cleanupInternalExamStudentActiveSessions(await signInAsAdmin())
  await cleanupE2eExamSittings()
  await ensureExamConfigs(await getAdminOrganizationId())
})

test.afterEach(async () => {
  await runCleanupSteps([
    cleanupE2eExamSittings,
    async () => cleanupInternalExamStudentActiveSessions(await signInAsAdmin()),
    restoreExamTimer,
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
  const scheduledAt = `${todayUtc()}T23:58`
  await page.getByLabel('Date and time (UTC)').fill(scheduledAt)
  await page.getByRole('combobox', { name: 'Mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await page.getByRole('combobox', { name: 'Invigilator' }).click()
  await page
    .getByRole('option', { name: /\((admin|instructor)\)$/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Save' }).click()
  // Marked off `scheduled_at`, before the navigation is awaited: the row exists the moment Save's
  // RPC returns, and a first-hit compile of `/sittings/[id]` can outlast the URL assertion, which
  // would leave an unmarked sitting no teardown can find.
  const id = await markSittingScheduledAt(`${scheduledAt}:00.000Z`)
  await expect(page).toHaveURL(SITTING_URL, { timeout: 30_000 })
  // The marked row is the one the UI opened, so later steps and teardown act on one sitting.
  expect(new URL(page.url()).pathname.split('/').pop()).toBe(id)
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

/**
 * Answers and confirms every question of the running exam, returning how many it answered.
 *
 * Bounded by the header's own `Question i of N`, never by probing the Next button: while an answer
 * is in flight `inFlightAnswers > 0` (`use-answer-handler.ts` increments BEFORE awaiting
 * `input.check`), so `slotAction` returns `'submit'` and renders the ghost Next as
 * `disabled={isLast || submitting}` (`quiz-nav-bar.tsx`). A non-retrying `isEnabled()` read inside
 * that window reports false on a question that is not the last, and the loop would exit after the
 * first answer with the exam 1/N complete.
 */
async function answerAll(page: Page): Promise<number> {
  const options = page.locator('button[data-testid^="option-"]')
  const next = page.getByRole('button', { name: /^Next/ })
  const header = page.getByText(/Question \d+ of \d+/)
  await expect(header).toBeVisible()
  const total = Number(/of (\d+)/.exec((await header.textContent()) ?? '')?.[1])
  if (!Number.isInteger(total) || total < 1) throw new Error('no question total in the header')
  for (let i = 1; i <= total; i++) {
    await expect(header).toHaveText(`Question ${i} of ${total}`)
    // The draw in `start_internal_exam_session` has no `question_type` predicate, so a non-MC
    // question in a configured topic renders no `option-` button. Assert before clicking: the
    // click alone has no timeout of its own and would block until the test budget ran out.
    await expect(options.first()).toBeVisible()
    await options.first().click()
    const confirm = page.getByRole('button', { name: 'Confirm Answer' })
    // Enabled only once an option is locked (`quiz-nav-bar.tsx`), and the click is untimed: assert
    // first so a missed option fails here instead of burning the test budget.
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(options.first()).toBeDisabled()
    if (i === total) break
    // Retrying, so it waits out the in-flight window instead of reading through it.
    await expect(next).toBeEnabled()
    await next.click()
  }
  return total
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
  // Asserted absent, not swallowed: `answerAll` answered every question, so the unanswered-count
  // warning must not appear. Catching the click made a short exam indistinguishable from a complete
  // one, and made the reverse regression — warning on a complete exam — unfailable.
  await expect(page.getByRole('button', { name: 'Submit anyway' })).toBeHidden()
  await page.waitForURL(/\/app\/internal-exam\/report\?session=/, { timeout: 30_000 })
  return new URL(page.url()).searchParams.get('session') ?? ''
}

async function openStudentContext(browser: Browser | null) {
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
  // This spec answers every question, which the seeded 60 s MET timer does not allow.
  await widenExamTimer(subject.id)
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
      await expect(
        row.getByText(
          'Opens when your invigilator starts the sitting — reload this page to check.',
        ),
      ).toBeVisible()
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
    const codeOf = (userId: string) => {
      const code = codes.find((c) => c.userId === userId)?.code
      // Failing soft would submit an empty code, surfacing minutes later as a nav timeout, and
      // would match every Codes row in a `hasText` filter.
      if (!code) throw new Error(`no sitting code for ${userId}`)
      return code
    }
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
      const answered = await answerAll(studentPage)
      // The journey under test is a MULTI-question exam: a seed drifting to one question would
      // leave the Next-navigation path untested while every assertion below still passed.
      expect(answered).toBeGreaterThan(1)
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
      // Assert the row exists first: `not.toContainText` resolves immediately on zero matches, so
      // dropping the finished student from the closed roster would otherwise pass.
      await expect(personRow(page, student.name)).toHaveCount(1)
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
