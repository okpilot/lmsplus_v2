import { expect, type Page, test } from '@playwright/test'
import { enrolStudent, GRANDFATHER_COURSE_IDS } from '@repo/db/enrol-students'
import { ensureNoConsentUser, removeNoConsentUser } from './helpers/no-consent-user'
import { ensureConsentRecords, getAdminClient } from './helpers/supabase'

const NONE_EMAIL = 'e2e-enrol-none@lmsplus.local'
const PPL_EMAIL = 'e2e-enrol-ppl@lmsplus.local'
const PASSWORD = 'e2e-enrol-password-2026!'
const RT_SUBJECT_NAME = 'VFR Radiotelephony (Slovenia)'

test.use({ storageState: { cookies: [], origins: [] } })

async function seedStudent(email: string, courseCodes: string[]) {
  const admin = getAdminClient()
  const userId = await ensureNoConsentUser({ email, password: PASSWORD, fullName: email })
  await ensureConsentRecords(admin, userId)
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single()
  if (userErr || !user) throw new Error(`seedStudent user: ${userErr?.message}`)
  const { error: clearErr } = await admin
    .from('course_enrolments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (clearErr) throw new Error(`seedStudent clear: ${clearErr.message}`)
  if (courseCodes.length === 0) return
  const { data: courses, error: cErr } = await admin
    .from('courses')
    .select('id')
    .in('code', courseCodes)
  if (cErr) throw new Error(`seedStudent courses: ${cErr.message}`)
  if ((courses ?? []).length !== courseCodes.length) {
    throw new Error(`seedStudent courses: found ${courses?.length ?? 0} of ${courseCodes.length}`)
  }
  const { error } = await admin.from('course_enrolments').insert(
    (courses ?? []).map((c) => ({
      organization_id: user.organization_id,
      user_id: userId,
      course_id: c.id,
    })),
  )
  if (error) throw new Error(`seedStudent enrol: ${error.message}`)
}

async function login(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
}

const ERROR_HEADING = 'Something went wrong'

async function openStudySubjectPicker(page: Page) {
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  const trigger = page.locator('[data-testid="subject-trigger"]')
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
}

test.describe('Course enrolment visibility', () => {
  test.beforeAll(async () => {
    await seedStudent(NONE_EMAIL, [])
    await seedStudent(PPL_EMAIL, ['PPL_A'])
  })

  test.afterAll(async () => {
    const errors: string[] = []
    for (const email of [NONE_EMAIL, PPL_EMAIL]) {
      try {
        await removeNoConsentUser(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('a student with no enrolments loads dashboard, quiz and VFR RT without an error page', async ({
    page,
  }) => {
    await login(page, NONE_EMAIL)
    await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)

    await page.goto('/app/quiz')
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
    await openStudySubjectPicker(page)
    await expect(page.locator('[data-testid="subject-option"]')).toHaveCount(0)

    await page.goto('/app/vfr-rt')
    await expect(page).toHaveURL(/\/app\/vfr-rt$/)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
  })

  test('a PPL-only student sees no RT subject in the picker', async ({ page }) => {
    await login(page, PPL_EMAIL)
    await page.goto('/app/quiz')
    await expect(page).toHaveURL(/\/app\/quiz$/)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
    await openStudySubjectPicker(page)
    const options = page.locator('[data-testid="subject-option"]')
    await expect(options.filter({ hasText: '050' }).first()).toBeVisible()
    await expect(options.filter({ hasText: RT_SUBJECT_NAME })).toHaveCount(0)
  })

  test('a PPL-only student sees the not-enrolled state on /app/vfr-rt', async ({ page }) => {
    await login(page, PPL_EMAIL)
    await page.goto('/app/vfr-rt')
    await expect(page).toHaveURL(/\/app\/vfr-rt$/)
    await expect(page.getByText(ERROR_HEADING)).toHaveCount(0)
    await expect(page.getByText(/not enrolled/i)).toBeVisible()
  })

  test('enrolling a PPL-only student in VFR RT mid-session unlocks the setup form; unenrolling hides it again', async ({
    page,
  }) => {
    const admin = getAdminClient()
    const { data: user, error } = await admin
      .from('users')
      .select('id, organization_id')
      .eq('email', PPL_EMAIL)
      .single()
    if (error || !user) throw new Error(`lifecycle user lookup: ${error?.message}`)
    const unenrolRt = async () => {
      const { error: unErr } = await admin
        .from('course_enrolments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('course_id', GRANDFATHER_COURSE_IDS[1])
        .is('deleted_at', null)
      if (unErr) throw new Error(`lifecycle unenrol: ${unErr.message}`)
    }
    // A CI retry starts from the PPL-only state.
    await unenrolRt()

    await login(page, PPL_EMAIL)
    await page.goto('/app/vfr-rt')
    await expect(page).toHaveURL(/\/app\/vfr-rt$/)
    await expect(page.getByText(/not enrolled/i)).toBeVisible()

    try {
      await enrolStudent(admin, {
        userId: user.id,
        orgId: user.organization_id,
        courseIds: [GRANDFATHER_COURSE_IDS[1]],
      })
      await page.reload()
      await expect(page).toHaveURL(/\/app\/vfr-rt$/)
      await expect(page.getByText(/not enrolled/i)).toHaveCount(0)
      await expect(page.getByRole('button', { name: /start practice/i })).toBeVisible()
    } finally {
      await unenrolRt()
    }
    await page.reload()
    await expect(page.getByText(/not enrolled/i)).toBeVisible()
  })
})
