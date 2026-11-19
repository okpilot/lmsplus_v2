/**
 * E2E (E-AF) — Internal Exams > Attempts tab: search and filters, Sitting column (#1777, PR 2d).
 * Seed: one sitting attempt (consumed sitting code of the internal-exam student, service role).
 * Auth: admin storage state.
 */
import { expect, test } from '@playwright/test'
import { formatUtc } from '../lib/utils/format-utc'
import { sittingModeLabel } from '../lib/utils/sitting-mode-label'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { insertPassedSession } from './helpers/exam-sitting-seed'
import { seedSittingFor } from './helpers/sitting-code'
import { getAdminClient, INTERNAL_EXAM_STUDENT_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const BASE = '/app/admin/internal-exams'
const FIRST_AT = '2031-03-01T07:13:00Z'
const OTHER_AT = '2031-03-02T07:13:00Z'
let sittingId: string
let otherSittingId: string
let studentName: string

/** Seeds a marked remote sitting at `sittingAt` holding one consumed code and the passed attempt it produced. */
async function seedPassedAttempt(sittingAt: string) {
  const seeded = await seedSittingFor({
    studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
    subjectFragment: 'Meteorology',
    scheduledAt: sittingAt,
  })
  const admin = getAdminClient()
  const code = await admin
    .from('internal_exam_codes')
    .select('id, organization_id, student_id, subject_id')
    .eq('code', seeded.code as string)
    .single()
  if (code.error) throw new Error(code.error.message)
  const sessionId = await insertPassedSession(admin, {
    orgId: code.data.organization_id,
    userId: code.data.student_id,
    subjectId: code.data.subject_id as string,
    score: 90,
    endedAt: new Date(Date.now() - 60_000),
  })
  const upd = await admin
    .from('internal_exam_codes')
    .update({ consumed_at: new Date().toISOString(), consumed_session_id: sessionId })
    .eq('id', code.data.id)
  if (upd.error) throw new Error(upd.error.message)
  return { sittingId: seeded.sittingId, studentName: seeded.studentName }
}

function sittingLabel(sittingAt: string): string {
  const when = formatUtc(sittingAt, { dateStyle: 'short', timeStyle: 'short' })
  return `${when} ${sittingModeLabel('remote')}`
}

test.beforeAll(async () => {
  const first = await seedPassedAttempt(FIRST_AT)
  sittingId = first.sittingId
  studentName = first.studentName
  otherSittingId = (await seedPassedAttempt(OTHER_AT)).sittingId
})

test.afterAll(async () => {
  await cleanupE2eExamSittings()
})

test.describe('Attempts tab filters', () => {
  test('sitting filter narrows to that sitting and survives a reload', async ({ page }) => {
    const otherLink = page.locator(`a[href="${BASE}/sittings/${otherSittingId}"]`)
    await page.goto(`${BASE}?tab=attempts`)
    await expect(otherLink.first()).toBeVisible()
    await page.goto(`${BASE}?tab=attempts&sitting=${sittingId}`)
    await expect(page.getByRole('link', { name: studentName }).first()).toBeVisible()
    await expect(otherLink).toHaveCount(0)
    await page.reload()
    expect(page.url()).toContain(`sitting=${sittingId}`)
    await expect(page.getByRole('link', { name: studentName }).first()).toBeVisible()
    await expect(otherLink).toHaveCount(0)
  })

  test('choosing a sitting in the select sets and clears the sitting filter', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts&attemptsPage=2`)
    const select = page.getByRole('combobox', { name: 'Sitting' })
    await select.click()
    await page.getByRole('option', { name: sittingLabel(FIRST_AT), exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`sitting=${sittingId}`))
    expect(page.url()).not.toContain('attemptsPage')
    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Sitting' })).toContainText(
      sittingLabel(FIRST_AT),
    )
    await page.getByRole('combobox', { name: 'Sitting' }).click()
    await page.getByRole('option', { name: 'All sittings', exact: true }).click()
    await expect(page).not.toHaveURL(/sitting=/)
  })

  test('typing a search then choosing a subject keeps both in the URL', async ({ page }) => {
    // Stretch only the 300 ms search debounce so the select is chosen while typing is still pending.
    await page.addInitScript(() => {
      const native = window.setTimeout.bind(window)
      window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        native(fn, ms === 300 ? 8000 : ms, ...args)) as typeof window.setTimeout
    })
    await page.goto(`${BASE}?tab=attempts`)
    await page.getByRole('searchbox').fill('e2e-pending')
    await page.getByRole('combobox', { name: 'Subject' }).click()
    await page.getByRole('option', { name: /Meteorology/ }).click()
    await expect(page).toHaveURL(/subject=/)
    await expect(page).toHaveURL(/q=e2e-pending/)
  })

  test('a search matching nothing shows the filtered empty message', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts`)
    await page.getByRole('searchbox').fill('zzz-no-such-student-zzz')
    await expect(page).toHaveURL(/q=zzz-no-such-student-zzz/)
    await page.reload()
    await expect(page.getByRole('searchbox')).toHaveValue('zzz-no-such-student-zzz')
    await expect(page.getByText('No attempts match these filters.')).toBeVisible()
  })

  test('changing a filter drops attemptsPage back to page 1', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts&attemptsPage=2`)
    await page.getByRole('searchbox').fill('a')
    await expect(page).toHaveURL(/q=a/)
    expect(page.url()).not.toContain('attemptsPage')
  })

  test('Sitting column links the attempt to its sitting page', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts&sitting=${sittingId}`)
    const link = page.locator(`a[href="${BASE}/sittings/${sittingId}"]`).first()
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/sittings/${sittingId}`))
  })

  test('Clear removes the filters from the URL', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts&q=abc&sitting=${sittingId}`)
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page).not.toHaveURL(/q=abc/)
    expect(page.url()).not.toContain('sitting=')
    await expect(page.getByRole('searchbox')).toHaveValue('')
  })

  test('a filter chosen while the search is loading keeps the search', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts`)
    await page.route('**/*', async (route) => {
      if (route.request().headers().rsc) await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.getByRole('searchbox').fill('zzz-no-such-student-zzz')
    await page.waitForTimeout(400)
    await page.getByRole('combobox', { name: 'Subject' }).click()
    await page.getByRole('option', { name: /Meteorology/ }).click()
    await expect(page).toHaveURL(/subject=/)
    await expect(page).toHaveURL(/q=zzz-no-such-student-zzz/)
    await expect(page.getByText('No attempts match these filters.')).toBeVisible()
    await page.unrouteAll({ behavior: 'wait' })
    await page.reload()
    await expect(page.getByRole('searchbox')).toHaveValue('zzz-no-such-student-zzz')
  })

  test('switching tab while the search is loading keeps the search', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts`)
    await page.route('**/*', async (route) => {
      if (route.request().headers().rsc) await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page.getByRole('searchbox').fill('zzz-no-such-student-zzz')
    await page.waitForTimeout(400)
    await page.getByRole('tab', { name: /^Codes/ }).click()
    await expect(page).toHaveURL(/tab=codes/)
    await expect(page).toHaveURL(/q=zzz-no-such-student-zzz/)
    await page.unrouteAll({ behavior: 'wait' })
  })
})
