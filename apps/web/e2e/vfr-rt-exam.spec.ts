/**
 * E2E — VFR RT mock exam in the shared quiz runner (PR3a).
 *
 * Seeds an RT pool + enabled RT exam_config into the e2e org (Egmont) for the shared
 * e2e student (e2e/.auth/user.json). workers=1 in playwright.config.ts, so the seeded
 * config never overlaps another spec; afterAll soft-deletes the pool.
 */

import { expect, type Page, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient, TEST_EMAIL } from './helpers/supabase'
import { getEgmontOrgId } from './redteam/helpers/seed-core'
import { cleanupVfrRtPool, seedVfrRtPool, type VfrRtPool } from './redteam/helpers/seed-vfr-rt-pool'

test.use({ storageState: 'e2e/.auth/user.json', viewport: { width: 1280, height: 1000 } })

type AnswerType = 'short_answer' | 'dialog_fill' | 'multiple_choice' | 'ordering' | 'diagram_label'

const SHORT_ANSWER = '[data-testid="short-answer-input"]'
const DIALOG_BLANK = '[data-testid^="blank-"]:not([data-testid^="blank-canonical"])'
const ORDERING_ITEM = '[data-testid^="ordering-item-"]'
const DIAGRAM_CHIP = '[data-testid^="diagram-label-chip-"]'
const MC_OPTION = '[data-testid^="option-"]'

async function startExam(page: Page): Promise<void> {
  await page.goto('/app/vfr-rt')
  const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
  await expect(examMode).toBeEnabled({ timeout: 10_000 })
  await examMode.click()
  await expect(examMode).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Start VFR RT Mock Exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 20_000 })
  await expect(page.getByText(/Question \d/).first()).toBeVisible({ timeout: 15_000 })
}

async function detectType(page: Page): Promise<AnswerType> {
  const probes: [AnswerType, string][] = [
    ['short_answer', SHORT_ANSWER],
    ['dialog_fill', DIALOG_BLANK],
    ['ordering', ORDERING_ITEM],
    ['diagram_label', DIAGRAM_CHIP],
    ['multiple_choice', MC_OPTION],
  ]
  let found: AnswerType | null = null
  await expect
    .poll(
      async () => {
        for (const [type, selector] of probes) {
          if ((await page.locator(selector).count()) > 0) {
            found = type
            return true
          }
        }
        return false
      },
      { timeout: 10_000 },
    )
    .toBe(true)
  if (!found) throw new Error('no question control rendered')
  return found
}

async function dragChipOntoFirstZone(page: Page): Promise<void> {
  const chip = page.locator(DIAGRAM_CHIP).first()
  const zone = page.locator('[data-testid^="diagram-label-zone-"]').first()
  const chipBox = await chip.boundingBox()
  const zoneBox = await zone.boundingBox()
  if (!chipBox || !zoneBox) throw new Error('diagram chip or zone not laid out')
  await page.mouse.move(chipBox.x + chipBox.width / 2, chipBox.y + chipBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(chipBox.x + chipBox.width / 2 + 10, chipBox.y + chipBox.height / 2 + 10, {
    steps: 5,
  })
  await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2, {
    steps: 15,
  })
  await page.mouse.up()
  await expect(zone.locator(DIAGRAM_CHIP)).toHaveCount(1)
}

/** Answers the visible question and asserts it locks with no correctness feedback. */
async function answerAndAssertLocked(page: Page, type: AnswerType): Promise<void> {
  const submit = page.getByRole('button', { name: 'Submit Answer' })
  if (type === 'short_answer') {
    const input = page.locator(SHORT_ANSWER)
    await input.fill('alpha')
    await submit.click()
    await expect(input).toBeDisabled()
  } else if (type === 'dialog_fill') {
    const blanks = page.locator(DIALOG_BLANK)
    const n = await blanks.count()
    for (let i = 0; i < n; i++) await blanks.nth(i).fill('x')
    await submit.click()
    await expect(blanks.first()).toBeDisabled()
  } else if (type === 'multiple_choice') {
    const option = page.locator(MC_OPTION).first()
    await option.click()
    await page.getByRole('button', { name: 'Confirm Answer' }).click()
    await expect(option).toBeDisabled()
  } else if (type === 'ordering') {
    await submit.click()
    await expect(submit).toHaveCount(0)
  } else {
    await dragChipOntoFirstZone(page)
    await submit.click()
    await expect(submit).toHaveCount(0)
  }
  await expect(page.getByText(/^(Correct|Incorrect)$/)).toHaveCount(0)
}

async function nextQuestion(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next ›' }).click()
}

async function finishAndSubmit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Finish VFR RT Mock Exam' }).click()
  await page.getByRole('button', { name: 'Submit VFR RT Mock Exam' }).click()
  const anyway = page.getByRole('button', { name: 'Submit anyway' })
  if (await anyway.isVisible({ timeout: 2_000 }).catch(() => false)) await anyway.click()
  await page.waitForURL(/\/app\/vfr-rt\/report\?session=/, { timeout: 30_000 })
}

test.describe('VFR RT mock exam', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  let pool: VfrRtPool
  let orgId: string

  test.beforeAll(async () => {
    const admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    const { data, error } = await admin.from('users').select('id').eq('email', TEST_EMAIL).single()
    if (error || !data) throw new Error(`beforeAll student lookup: ${error?.message}`)
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: data.id })
  })

  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(TEST_EMAIL)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupStudentActiveSessions(TEST_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupVfrRtPool({ admin: getAdminClient(), orgId, pool })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('answers every question type without feedback and lands on the VFR RT report', async ({
    page,
  }) => {
    await startExam(page)

    const answered = new Set<AnswerType>()
    for (let i = 0; i < 25 && answered.size < 5; i++) {
      const type = await detectType(page)
      if (!answered.has(type)) {
        await answerAndAssertLocked(page, type)
        answered.add(type)
      }
      if (answered.size < 5) await nextQuestion(page)
    }
    expect([...answered].sort()).toEqual(
      ['diagram_label', 'dialog_fill', 'multiple_choice', 'ordering', 'short_answer'].sort(),
    )

    await finishAndSubmit(page)
    await expect(page.getByRole('heading', { name: 'VFR RT Mock Exam Results' })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('VFR RT Mock Exam Complete')).toBeVisible()
    await expect(page.getByRole('img', { name: /Score:/ })).toBeVisible()
  })

  test('resumes a reloaded exam with its locked answers and no way to discard it', async ({
    page,
  }) => {
    await startExam(page)
    for (let i = 0; i < 2; i++) {
      await answerAndAssertLocked(page, await detectType(page))
      if (i === 0) await nextQuestion(page)
    }

    await page.reload()
    await expect(page.getByText('Resume your VFR RT Mock Exam?')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Discard' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page).toHaveURL(/\/app\/quiz\/session/)
    await expect(page.getByText(/Question \d/).first()).toBeVisible({ timeout: 15_000 })

    // Both answered questions are still locked after the resume.
    const prev = page.getByRole('button', { name: /Previous/ })
    while (await prev.isEnabled()) await prev.click()
    for (let i = 0; i < 2; i++) {
      await expect(page.locator(SHORT_ANSWER)).toBeDisabled()
      await expect(page.locator(SHORT_ANSWER)).toHaveValue('alpha')
      if (i === 0) await nextQuestion(page)
    }

    await finishAndSubmit(page)
    await expect(page.getByRole('heading', { name: 'VFR RT Mock Exam Results' })).toBeVisible({
      timeout: 15_000,
    })
  })
})
