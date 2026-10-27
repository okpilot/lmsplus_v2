/**
 * Red Team Spec — dashboard course chips (#1638).
 *   KS (cookie-state): a VFR_RT-only student forges `dashboard_course=PPL_A`; the dashboard
 *       renders no PPL subject and no chip group.
 *   KT (idor): `selectDashboardCourse` replayed with a non-enrolled code → "Not enrolled in this
 *       course", a malformed code → "Invalid input"; the cookie is not written.
 * CONTROL: a PPL_A + VFR_RT student's forged cookie switches the grid both ways, and the same
 *   replay with an enrolled code writes the cookie.
 *
 * Hermetic: dedicated throwaway students; afterEach clears the course cookie of both contexts.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { DASHBOARD_COURSE_COOKIE } from '../../lib/dashboard/resolve-course'
import { ensureConsentRecords, getAdminClient } from '../helpers/supabase'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KS_FULL_EMAIL,
  E2E_REDTEAM_KS_PASSWORD,
  E2E_REDTEAM_KS_RT_ONLY_EMAIL,
} from './helpers/seed-markers'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const RT_ONLY_EMAIL = E2E_REDTEAM_KS_RT_ONLY_EMAIL
const FULL_EMAIL = E2E_REDTEAM_KS_FULL_EMAIL
const PASSWORD = E2E_REDTEAM_KS_PASSWORD
const BASE_URL = 'http://localhost:3000'
const DASHBOARD = '/app/dashboard'
const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

type Captured = { headers: Record<string, string>; id: string }

test.describe('Red Team: dashboard course cookie + selectDashboardCourse (KS, KT)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let rtOnlyCtx: BrowserContext
  let fullCtx: BrowserContext
  let pplSubjectName = ''
  let cap: Captured

  const liveEnrolments = async (userId: string): Promise<string[]> => {
    const { data, error } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw new Error(`enrolments: ${error.message}`)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  const courseCookie = async (ctx: BrowserContext): Promise<string | undefined> =>
    (await ctx.cookies(BASE_URL + DASHBOARD)).find((c) => c.name === DASHBOARD_COURSE_COOKIE)?.value

  const forgeCookie = (ctx: BrowserContext, value: string) =>
    ctx.addCookies([{ name: DASHBOARD_COURSE_COOKIE, value, url: `${BASE_URL}/app` }])

  const clearCourseCookie = (ctx: BrowserContext) =>
    ctx.clearCookies({ name: DASHBOARD_COURSE_COOKIE })

  const openSignedIn = async (
    browser: Browser,
    email: string,
    userId: string,
  ): Promise<{ ctx: BrowserContext; page: Page; watch: ReturnType<typeof watchServerActions> }> => {
    await ensureConsentRecords(admin, userId)
    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(userId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    // Registered before sign-in: the dashboard chunks load once, on the post-login redirect.
    const watch = watchServerActions(page)
    await signInViaForm(page, { email, password: PASSWORD })
    return { ctx, page, watch }
  }

  const gridShowsPpl = async (ctx: BrowserContext): Promise<boolean> => {
    const page = await ctx.newPage()
    try {
      await page.goto(DASHBOARD)
      await expect(page.getByRole('main')).toBeVisible()
      // Wait for the subject grid Suspense boundary to resolve.
      await expect(
        page.getByText('No subjects available yet.').or(page.getByText(pplSubjectName)).first(),
      ).toBeVisible({ timeout: 15_000 })
      return (await page.getByText(pplSubjectName, { exact: true }).count()) > 0
    } finally {
      await page.close()
    }
  }

  const invoke = (ctx: BrowserContext, code: string) =>
    postServerAction(ctx.request, {
      url: BASE_URL + DASHBOARD,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg: { code },
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    const rtOnlyId = await upsertUser(admin, RT_ONLY_EMAIL, PASSWORD, orgId)
    const fullId = await upsertUser(admin, FULL_EMAIL, PASSWORD, orgId)
    const { error: unenrolErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', rtOnlyId)
      .eq('course_id', PPL_COURSE_ID)
      .is('deleted_at', null)
    if (unenrolErr) throw new Error(`unenrol PPL: ${unenrolErr.message}`)
    expect(await liveEnrolments(rtOnlyId)).toEqual([VFR_RT_COURSE_ID])
    expect(await liveEnrolments(fullId)).toEqual([PPL_COURSE_ID, VFR_RT_COURSE_ID].sort())

    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('name, course_id')
      .eq('code', '050')
      .single()
    if (subjErr || !subj) throw new Error(`subject 050: ${subjErr?.message}`)
    expect(subj.course_id).toBe(PPL_COURSE_ID)
    pplSubjectName = subj.name as string

    const rt = await openSignedIn(browser, RT_ONLY_EMAIL, rtOnlyId)
    rtOnlyCtx = rt.ctx
    await rt.page.close()

    const full = await openSignedIn(browser, FULL_EMAIL, fullId)
    fullCtx = full.ctx
    const { watch } = full
    const chips = full.page.getByRole('group', { name: 'Course' })
    await chips.getByRole('button', { name: 'RT' }).click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 15_000 }).toBe(true)
    await expect.poll(() => courseCookie(fullCtx), { timeout: 15_000 }).toBe('VFR_RT')
    const ids = await watch.settle()
    await full.page.close()
    const id = ids.get('selectDashboardCourse')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('selectDashboardCourse action not captured')
    expect(headers['next-action']).toBe(id)
    cap = { headers, id }
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const ctx of [rtOnlyCtx, fullCtx]) {
      try {
        if (ctx) await clearCourseCookie(ctx)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test.afterAll(async () => {
    await rtOnlyCtx?.close()
    await fullCtx?.close()
  })

  test('KS: a forged course cookie for a non-enrolled course renders none of its subjects', async () => {
    await forgeCookie(rtOnlyCtx, 'PPL_A')
    expect(await gridShowsPpl(rtOnlyCtx)).toBe(false)
    const page = await rtOnlyCtx.newPage()
    await page.goto(DASHBOARD)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Course' })).toHaveCount(0)
    await page.close()

    // CONTROL: the cookie is honoured for an enrolled student, both ways.
    await forgeCookie(fullCtx, 'VFR_RT')
    expect(await gridShowsPpl(fullCtx)).toBe(false)
    await forgeCookie(fullCtx, 'PPL_A')
    expect(await gridShowsPpl(fullCtx)).toBe(true)
  })

  test('KT: selectDashboardCourse refuses a non-enrolled or malformed code', async () => {
    await clearCourseCookie(rtOnlyCtx)
    const denied = await invoke(rtOnlyCtx, 'PPL_A')
    expect(denied).not.toContain('"success":true')
    expect(denied).toContain('Not enrolled in this course')
    expect(await courseCookie(rtOnlyCtx)).toBeUndefined()

    const malformed = await invoke(rtOnlyCtx, "VFR_RT'--")
    expect(malformed).not.toContain('"success":true')
    expect(malformed).toContain('Invalid input')
    expect(await courseCookie(rtOnlyCtx)).toBeUndefined()

    // CONTROL: the identical replay with an enrolled code writes the cookie.
    const ok = await invoke(rtOnlyCtx, 'VFR_RT')
    expect(ok).toContain('"success":true')
    expect(await courseCookie(rtOnlyCtx)).toBe('VFR_RT')

    await forgeCookie(fullCtx, 'VFR_RT')
    const okFull = await invoke(fullCtx, 'PPL_A')
    expect(okFull).toContain('"success":true')
    expect(await courseCookie(fullCtx)).toBe('PPL_A')
  })
})
