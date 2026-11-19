/**
 * E2E (E-AF) — Internal Exams > Attempts tab: search and filters, Sitting column (#1777, PR 2d).
 * Seed: one sitting attempt (consumed sitting code of the internal-exam student, service role).
 * Auth: admin storage state.
 */
import { expect, test } from '@playwright/test'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { insertPassedSession } from './helpers/exam-sitting-seed'
import { seedSittingFor } from './helpers/sitting-code'
import { getAdminClient, INTERNAL_EXAM_STUDENT_EMAIL } from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const BASE = '/app/admin/internal-exams'
let sittingId: string
let studentName: string

test.beforeAll(async () => {
  const seeded = await seedSittingFor({
    studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
    subjectFragment: 'Meteorology',
  })
  sittingId = seeded.sittingId
  studentName = seeded.studentName
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
})

test.afterAll(async () => {
  await cleanupE2eExamSittings()
})

test.describe('Attempts tab filters', () => {
  test('sitting filter narrows to that sitting and survives a reload', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts&sitting=${sittingId}`)
    await expect(page.getByRole('link', { name: studentName }).first()).toBeVisible()
    await page.reload()
    expect(page.url()).toContain(`sitting=${sittingId}`)
    await expect(page.getByRole('link', { name: studentName }).first()).toBeVisible()
  })

  test('a search matching nothing shows the filtered empty message', async ({ page }) => {
    await page.goto(`${BASE}?tab=attempts`)
    await page.getByRole('searchbox').fill('zzz-no-such-student-zzz')
    await expect(page).toHaveURL(/q=zzz-no-such-student-zzz/)
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
  })
})
