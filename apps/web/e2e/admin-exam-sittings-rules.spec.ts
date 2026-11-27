import { expect as baseExpect, test } from '@playwright/test'
import { getAdminOrganizationId } from './helpers/admin-supabase'
import { cleanupCreatedExamConfigs, ensureExamConfigs } from './helpers/exam-config-cleanup'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { adminIds, runCleanupSteps } from './helpers/exam-sitting-flow-seed'
import { insertPassedSession, seedSitting } from './helpers/exam-sitting-seed'
import { getAdminClient } from './helpers/supabase'
import { skipNearUtcRollover } from './helpers/utc-rollover'

const expect = baseExpect.configure({ timeout: 25_000 })

test.use({ storageState: 'e2e/.auth/admin.json', viewport: { width: 1280, height: 800 } })
test.setTimeout(120_000)

const BASE = '/app/admin/internal-exams/sittings'

test.beforeEach(async () => {
  skipNearUtcRollover()
  // `subjects[0]` must carry a live enabled exam config: `seedSitting` only SORTS a configured
  // subject first, so with none the eligibility and prune assertions fail for an unrelated reason.
  await ensureExamConfigs(await getAdminOrganizationId())
})

// The cleanup also removes the passed sessions of the seeded students (found by student).
test.afterEach(async () => {
  await runCleanupSteps([cleanupE2eExamSittings, cleanupCreatedExamConfigs])
})

/** A passed session ended 30 minutes ago for a seeded student. */
async function seedPassedAttempt(userId: string, subjectId: string, score: number) {
  const admin = getAdminClient()
  const { orgId } = await adminIds(admin)
  const endedAt = new Date(Date.now() - 1_800_000)
  await insertPassedSession(admin, { orgId, userId, subjectId, score, endedAt })
  return { endedAt }
}

/** "17 Nov 2026 UTC": what the app prints — `formatUtc` labels any output carrying a day part. */
function utcDay(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${fmt.format(d)} UTC`
}

test('single-person Add exams shows a passed exam with its date and score', async ({ page }) => {
  const { sittingId, people, subjects } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Rule Ann', entries: [], enrolled: true }],
  })
  const subject = subjects[0]
  if (!subject) throw new Error('seedSitting returned no subject')
  const first = people[0]
  if (!first) throw new Error('seedSitting returned no people')
  const attempt = await seedPassedAttempt(first.userId, subject.id, 83)

  await page.goto(`${BASE}/${sittingId}`)
  await page.getByRole('button', { name: 'Actions for E2E Rule Ann' }).click()
  await page.getByRole('menuitem', { name: 'Add exams' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add exams for E2E Rule Ann' })).toBeVisible()
  await expect(dialog.getByText(`Passed ${utcDay(attempt.endedAt)} · 83%`)).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: `Add ${subject.short}` })).toHaveCount(0)
})

test('a student who passed is removed from the sitting and listed with the pass date', async ({
  page,
}) => {
  const { sittingId, people, subjects } = await seedSitting({
    status: 'scheduled',
    people: [{ name: 'E2E Rule Bea', entries: [{ state: 'live' }] }],
  })
  const subject = subjects[0]
  if (!subject) throw new Error('seedSitting returned no subject')
  const first = people[0]
  if (!first) throw new Error('seedSitting returned no people')
  const attempt = await seedPassedAttempt(first.userId, subject.id, 91)

  await page.goto(`${BASE}/${sittingId}`)
  await expect(page.getByRole('heading', { name: 'Removed automatically (1)' })).toBeVisible()
  await expect(
    page.getByText(
      `E2E Rule Bea · ${subject.short} · passed ${utcDay(attempt.endedAt)} · notice pending`,
    ),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Removed automatically (1)' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'E2E Rule Bea' })).toContainText('No exams')
})
