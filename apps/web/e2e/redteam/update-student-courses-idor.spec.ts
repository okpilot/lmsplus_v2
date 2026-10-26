/**
 * Red Team Spec: updateStudent Server Action `course_ids` (Vector KH, #1636).
 *
 * KH (idor): an egmont admin replays updateStudent with another org's student id plus
 *     `course_ids` → "Student not found"; the target's name and enrolments are unchanged.
 * CONTROL: the identical replay on an in-org student enrols it in ATPL(A).
 *
 * Hermetic: dedicated throwaway in-org student; afterEach soft-deletes the ATPL enrolment rows
 * of both targets (`deleted_at`, never a hard DELETE) and restores the cross-org name.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_KH_STUDENT_EMAIL,
  E2E_REDTEAM_KH_STUDENT_PASSWORD,
} from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createCrossOrgUser,
  seedRedTeamAdmin,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const STUDENTS_PATH = '/app/admin/students'
const ATPL_A_ID = 'c0a5e000-0000-4000-8000-000000000003'

type Captured = { headers: Record<string, string>; id: string }

test.describe('Red Team: updateStudent course_ids cross-org (KH)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let inOrgStudentId = ''
  let inOrgName = ''
  let crossOrgStudentId = ''
  let crossOrgName = ''
  let ctx: BrowserContext
  let cap: Captured

  const readName = async (id: string): Promise<string> => {
    const { data, error } = await admin.from('users').select('full_name').eq('id', id).single()
    if (error || !data) throw new Error(`readName ${id}: ${error?.message}`)
    return data.full_name as string
  }

  const activeCourseIds = async (userId: string): Promise<string[]> => {
    const { data, error } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw new Error(`activeCourseIds ${userId}: ${error.message}`)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  const softDeleteAtpl = async (userId: string): Promise<void> => {
    const { error } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('course_id', ATPL_A_ID)
      .is('deleted_at', null)
    if (error) throw new Error(`softDeleteAtpl ${userId}: ${error.message}`)
  }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${STUDENTS_PATH}`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    inOrgStudentId = await upsertUser(
      admin,
      E2E_REDTEAM_KH_STUDENT_EMAIL,
      E2E_REDTEAM_KH_STUDENT_PASSWORD,
      orgId,
    )
    inOrgName = await readName(inOrgStudentId)
    const cross = await createCrossOrgUser()
    expect(cross.orgId).not.toBe(orgId)
    crossOrgStudentId = cross.userId
    crossOrgName = await readName(crossOrgStudentId)
    const { adminUserId } = await seedRedTeamAdmin()

    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(adminUserId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    await signInViaForm(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(`${STUDENTS_PATH}?search=redteam-kh-enrolments`)
    const row = page.locator('tbody tr').filter({ hasText: inOrgName })
    await row.getByRole('button', { name: 'Edit student' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 15_000 }).toBe(true)
    await expect(page.getByText('Student updated')).toBeVisible({ timeout: 15_000 })
    const ids = await watch.settle()
    await page.close()
    const id = ids.get('updateStudent')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('updateStudent action not captured')
    expect(headers['next-action']).toBe(id)
    cap = { headers, id }
  })

  test.beforeEach(async () => {
    await softDeleteAtpl(inOrgStudentId)
    await softDeleteAtpl(crossOrgStudentId)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const id of [inOrgStudentId, crossOrgStudentId]) {
      try {
        await softDeleteAtpl(id)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      const { error } = await admin
        .from('users')
        .update({ full_name: crossOrgName })
        .eq('id', crossOrgStudentId)
      if (error) throw new Error(`restore cross-org name: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test.afterAll(async () => {
    await ctx?.close()
  })

  test('KH: a cross-org student is neither renamed nor enrolled; the in-org student is enrolled', async () => {
    expect(await activeCourseIds(crossOrgStudentId)).not.toContain(ATPL_A_ID)

    const res = await invoke({
      id: crossOrgStudentId,
      full_name: 'KH PWNED',
      role: 'student',
      course_ids: [ATPL_A_ID],
    })
    expect(res).not.toContain('"success":true')
    expect(res).toContain('Student not found')
    expect(await readName(crossOrgStudentId)).toBe(crossOrgName)
    expect(await activeCourseIds(crossOrgStudentId)).not.toContain(ATPL_A_ID)

    // CONTROL: the identical replay on an in-org student enrols it.
    expect(await activeCourseIds(inOrgStudentId)).not.toContain(ATPL_A_ID)
    const ok = await invoke({
      id: inOrgStudentId,
      full_name: inOrgName,
      role: 'student',
      course_ids: [ATPL_A_ID],
    })
    expect(ok).toContain('"success":true')
    expect(await activeCourseIds(inOrgStudentId)).toEqual([ATPL_A_ID])
  })
})
