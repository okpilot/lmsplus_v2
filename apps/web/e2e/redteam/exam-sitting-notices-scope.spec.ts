/**
 * Red Team Spec: sendSittingNotices Server Action scope (Vector NP, #1777)
 *
 * The action reads recipients, subjects and the sitting through adminClient (RLS bypassed); the
 * org filter is manual. Attack: a cross-org admin and an egmont student replay sendSittingNotices
 * with a cancelled egmont sitting that holds 2 pending cancellation notices.
 * Expected: nothing attempted (`"sent":0`, no failed names); no `exam_sitting.notice_emailed` row.
 * CONTROL: the egmont admin's identical replay attempts both notices (sent + failed = 2); outside
 * CI (`next dev`, no RESEND_API_KEY) both are sent and recorded.
 *
 * Hermetic: throwaway students; sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the
 * created codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

type Admin = ReturnType<typeof getAdminClient>

const BASE_URL = 'http://localhost:3000'
const NP_EMAILS = [
  'redteam-np-student-a@lmsplus.local',
  'redteam-np-student-b@lmsplus.local',
  'redteam-np-student-c@lmsplus.local',
]
const NP_PASSWORD = 'redteam-np-student-2026!'
const SENDS = !process.env.CI

async function signedInContext(
  browser: Browser,
  userId: string,
  creds: { email: string; password: string },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: undefined })
  await ctx.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(userId), url: BASE_URL },
  ])
  const page = await ctx.newPage()
  await signInViaForm(page, creds)
  await page.close()
  return ctx
}

/** Issues codes to `userIds`, marks them emailed (fixture), cancels the sitting. */
async function cancelledSittingWithEmailedCodes(
  admin: Admin,
  egmont: SupabaseClient,
  sittingId: string,
  userIds: string[],
  subjectId: string,
): Promise<string[]> {
  const add = await egmont.rpc('add_exam_sitting_candidates', {
    p_sitting_id: sittingId,
    p_user_ids: userIds,
  })
  if (add.error) throw new Error(`add candidates: ${add.error.message}`)
  const ent = await egmont.rpc('add_exam_sitting_entries', {
    p_sitting_id: sittingId,
    p_user_ids: userIds,
    p_subject_ids: userIds.map(() => subjectId),
  })
  if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
  const iss = await egmont.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
  if (iss.error) throw new Error(`issue: ${iss.error.message}`)
  const { data: codes, error: cErr } = await admin
    .from('internal_exam_codes')
    .select('id, exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id)')
    .eq('exam_sitting_entries.sitting_id', sittingId)
    .is('voided_at', null)
    .is('deleted_at', null)
  if (cErr || codes?.length !== userIds.length)
    throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
  const ids = codes.map((c) => c.id)
  const mark = await admin
    .from('internal_exam_codes')
    .update({ emailed_at: new Date().toISOString() })
    .in('id', ids)
  if (mark.error) throw new Error(`emailed_at: ${mark.error.message}`)
  const cancel = await egmont.rpc('cancel_exam_sitting', { p_sitting_id: sittingId })
  if (cancel.error) throw new Error(`cancel: ${cancel.error.message}`)
  return ids
}

async function noticeRows(admin: Admin, sittingId: string): Promise<number> {
  const { data, error } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'exam_sitting.notice_emailed')
    .eq('resource_id', sittingId)
  if (error || !data) throw new Error(`audit: ${error?.message}`)
  return data.length
}

/** Notices one response attempted: sent + failed names. */
function attempted(body: string): number {
  const sent = Number(/"sent":(\d+)/.exec(body)?.[1] ?? Number.NaN)
  return sent + (body.match(/"studentName"/g)?.length ?? 0)
}

test.describe('Red Team: sendSittingNotices scope (NP)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let adminCtx: BrowserContext
  let crossCtx: BrowserContext
  let studentCtx: BrowserContext
  let headers: Record<string, string>
  let actionId: string
  let decoyId: string
  let sittingId: string
  let studentIds: string[] = []
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  const invoke = (ctx: BrowserContext, arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}/app/admin/internal-exams/sittings/${decoyId}`,
      headers,
      id: actionId,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const att = await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const cross = await seedCrossOrgAdmin()
    expect(cross.orgId).not.toBe(a.orgId)
    track.adminId = a.adminUserId
    studentIds = []
    for (const email of NP_EMAILS)
      studentIds.push(await upsertUser(admin, email, NP_PASSWORD, a.orgId))
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    const egmont = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    decoyId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(decoyId)
    sittingId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(sittingId)
    const [c] = studentIds.slice(2)
    await cancelledSittingWithEmailedCodes(admin, egmont, decoyId, [c as string], picked.subjectId)
    await cancelledSittingWithEmailedCodes(
      admin,
      egmont,
      sittingId,
      studentIds.slice(0, 2),
      picked.subjectId,
    )

    adminCtx = await signedInContext(browser, a.adminUserId, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    })
    const page = await adminCtx.newPage()
    const watch = watchServerActions(page)
    await page.goto(`/app/admin/internal-exams/sittings/${decoyId}`)
    await expect(page.getByText('1 notice waiting to be sent.')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Send notices' }).click()
    await expect(page.getByText(/Sent [01]/)).toBeVisible({ timeout: 15_000 })
    const ids = await watch.settle()
    await page.close()
    const h = watch.headers()
    const id = ids.get('sendSittingNotices')
    if (!h || !id) throw new Error(`actions not captured: ${[...ids.keys()]}`)
    expect(h['next-action']).toBe(id)
    headers = h
    actionId = id

    crossCtx = await signedInContext(browser, cross.adminUserId, cross)
    studentCtx = await signedInContext(browser, att.attackerUserId, {
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
    })
  })

  test.afterAll(async () => {
    const errors: string[] = []
    for (const ctx of [adminCtx, crossCtx, studentCtx]) await ctx?.close().catch(() => {})
    try {
      if (studentIds.length > 0) {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('student_id', studentIds)
          .not('sitting_entry_id', 'is', null)
          .is('deleted_at', null)
        if (error) throw new Error(`codes: ${error.message}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NP afterAll: ${errors.join('; ')}`)
  })

  test('NP: cross-org admin and student replays attempt no notice; the egmont admin replay does', async () => {
    expect(await noticeRows(admin, sittingId)).toBe(0)

    const crossBody = await invoke(crossCtx, { sittingId })
    expect(attempted(crossBody), crossBody).toBe(0)
    const studentBody = await invoke(studentCtx, { sittingId })
    expect(studentBody).not.toContain('"success":true')
    expect(await noticeRows(admin, sittingId)).toBe(0)

    // CONTROL: the egmont admin's identical replay attempts both notices.
    const okBody = await invoke(adminCtx, { sittingId })
    expect(okBody).toContain('"success":true')
    expect(attempted(okBody), okBody).toBe(2)
    if (SENDS) expect(await noticeRows(admin, sittingId)).toBe(2)
  })
})
