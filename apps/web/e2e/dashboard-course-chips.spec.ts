import { expect, type Page, test } from '@playwright/test'
import { ensureNoConsentUser, removeNoConsentUser } from './helpers/no-consent-user'
import { ensureConsentRecords, getAdminClient } from './helpers/supabase'

const BOTH_EMAIL = 'e2e-chips-both@lmsplus.local'
const PPL_EMAIL = 'e2e-chips-ppl@lmsplus.local'
const PASSWORD = 'e2e-chips-password-2026!'
// seed-e2e ships no RT questions, so the RT course shows the empty subject grid.
const NO_SUBJECTS = 'No subjects available yet.'
// seed-e2e subject 050 (PPL_A).
const PPL_SUBJECT = 'Meteorology'

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
  const { data: courses, error: cErr } = await admin
    .from('courses')
    .select('id')
    .in('code', courseCodes)
  if (cErr) throw new Error(`seedStudent courses: ${cErr.message}`)
  if ((courses ?? []).length !== courseCodes.length) {
    throw new Error(
      `seedStudent courses: found ${courses?.length ?? 0} of ${courseCodes.join(',')}`,
    )
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

test.describe('Dashboard course chips', () => {
  test.beforeAll(async () => {
    await seedStudent(BOTH_EMAIL, ['PPL_A', 'VFR_RT'])
    await seedStudent(PPL_EMAIL, ['PPL_A'])
  })

  test.afterAll(async () => {
    const errors: string[] = []
    for (const email of [BOTH_EMAIL, PPL_EMAIL]) {
      try {
        await removeNoConsentUser(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('a student enrolled in two courses switches chips and the pick persists across reload', async ({
    page,
  }) => {
    await login(page, BOTH_EMAIL)
    const chips = page.getByRole('group', { name: 'Course' })
    await expect(chips.getByRole('button', { name: 'PPL' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Subject Progress' })).toBeVisible()
    await expect(page.getByText(PPL_SUBJECT, { exact: true })).toBeVisible()
    await expect(page.getByText(NO_SUBJECTS)).toHaveCount(0)

    await chips.getByRole('button', { name: 'RT' }).click()
    await expect(chips.getByRole('button', { name: 'RT' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(NO_SUBJECTS)).toBeVisible()
    await expect(page.getByText(PPL_SUBJECT, { exact: true })).toHaveCount(0)

    await page.reload()
    await expect(
      page.getByRole('group', { name: 'Course' }).getByRole('button', { name: 'RT' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(NO_SUBJECTS)).toBeVisible()
  })

  test('a PPL-only student sees no chips and no VFR RT nav entry', async ({ page }) => {
    await login(page, PPL_EMAIL)
    await expect(page.getByTestId('dashboard-course-chips-ready')).toBeAttached()
    await expect(page.getByTestId('vfr-rt-nav-ready')).toBeAttached()
    await expect(page.getByText(PPL_SUBJECT, { exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Course' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'VFR RT' })).toHaveCount(0)
  })

  test('a student enrolled in VFR RT sees the VFR RT nav entry', async ({ page }) => {
    await login(page, BOTH_EMAIL)
    await expect(page.getByRole('link', { name: 'VFR RT' }).first()).toBeVisible()
  })
})
