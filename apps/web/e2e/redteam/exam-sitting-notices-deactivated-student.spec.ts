/**
 * Red Team Spec: cancellation notice never reaches a deactivated student (Vector NQ, #1777)
 *
 * sendSittingNotices reads recipients through adminClient (RLS bypassed); the `users.deleted_at`
 * filter is manual (notice-queries.ts getNoticeRecipients).
 * Attack: cancel a sitting whose codes were emailed to students A and B, deactivate A, then the
 * egmont admin replays sendSittingNotices.
 * Expected: A's code gets no `exam_sitting.notice_emailed` row and the response names one attempt.
 * CONTROL: the same replay attempts B's notice; outside CI (`next dev`, no RESEND_API_KEY) B's
 * code gets one notice row.
 *
 * Hermetic: throwaway students (re-activated in beforeAll and afterAll); sittings carry
 * EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the created codes, then cleanupSittingFixtures
 * (per-step accumulator).
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
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

type Admin = ReturnType<typeof getAdminClient>

const BASE_URL = 'http://localhost:3000'
const NQ_EMAILS = [
  'redteam-nq-student-a@lmsplus.local',
  'redteam-nq-student-b@lmsplus.local',
  'redteam-nq-student-c@lmsplus.local',
]
const NQ_PASSWORD = 'redteam-nq-student-2026!'
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

/** Issues codes to `userIds`, marks them emailed (fixture), cancels the sitting; code id per user. */
async function cancelledSittingWithEmailedCodes(
  admin: Admin,
  egmont: SupabaseClient,
  sittingId: string,
  userIds: string[],
  subjectId: string,
): Promise<Map<string, string>> {
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
    .select(
      'id, student_id, exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id)',
    )
    .eq('exam_sitting_entries.sitting_id', sittingId)
    .is('voided_at', null)
    .is('deleted_at', null)
  if (cErr || codes?.length !== userIds.length)
    throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
  const mark = await admin
    .from('internal_exam_codes')
    .update({ emailed_at: new Date().toISOString() })
    .in(
      'id',
      codes.map((c) => c.id),
    )
  if (mark.error) throw new Error(`emailed_at: ${mark.error.message}`)
  const cancel = await egmont.rpc('cancel_exam_sitting', { p_sitting_id: sittingId })
  if (cancel.error) throw new Error(`cancel: ${cancel.error.message}`)
  return new Map(codes.map((c) => [c.student_id, c.id]))
}

/** notice_emailed rows of the sitting for `codeId`. */
async function noticeRows(admin: Admin, sittingId: string, codeId: string): Promise<number> {
  const { data, error } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'exam_sitting.notice_emailed')
    .eq('resource_id', sittingId)
    .eq('metadata->>code_id', codeId)
  if (error || !data) throw new Error(`audit: ${error?.message}`)
  return data.length
}

/** Notices one response attempted: sent + failed names. */
function attempted(body: string): number {
  const sent = Number(/"sent":(\d+)/.exec(body)?.[1] ?? Number.NaN)
  return sent + (body.match(/"studentName"/g)?.length ?? 0)
}

async function setDeleted(
  admin: Admin,
  ids: string[],
  deletedAt: string | null,
  by: string | null,
) {
  const { error } = await admin
    .from('users')
    .update({ deleted_at: deletedAt, deleted_by: by })
    .in('id', ids)
  if (error) throw new Error(`users.deleted_at: ${error.message}`)
}

test.describe('Red Team: sendSittingNotices skips a deactivated student (NQ)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let adminCtx: BrowserContext
  let headers: Record<string, string>
  let actionId: string
  let decoyId: string
  let sittingId: string
  let studentIds: string[] = []
  let codeA: string
  let codeB: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(adminCtx.request, {
      url: `${BASE_URL}/app/admin/internal-exams/sittings/${decoyId}`,
      headers,
      id: actionId,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentIds = []
    for (const email of NQ_EMAILS)
      studentIds.push(await upsertUser(admin, email, NQ_PASSWORD, a.orgId))
    // A prior run may leave A deactivated; candidates/entries need an active student.
    await setDeleted(admin, studentIds, null, null)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    const egmont = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    decoyId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(decoyId)
    sittingId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(sittingId)
    await cancelledSittingWithEmailedCodes(
      admin,
      egmont,
      decoyId,
      [studentIds[2] as string],
      picked.subjectId,
    )
    const codes = await cancelledSittingWithEmailedCodes(
      admin,
      egmont,
      sittingId,
      studentIds.slice(0, 2),
      picked.subjectId,
    )
    codeA = codes.get(studentIds[0] as string) as string
    codeB = codes.get(studentIds[1] as string) as string

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
    headers = h
    actionId = id
  })

  test.afterAll(async () => {
    const errors: string[] = []
    await adminCtx?.close().catch(() => {})
    try {
      if (studentIds.length > 0) await setDeleted(admin, studentIds, null, null)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
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
    if (errors.length > 0) throw new Error(`NQ afterAll: ${errors.join('; ')}`)
  })

  test('NQ: a deactivated student gets no cancellation notice; an active peer does', async () => {
    expect(await noticeRows(admin, sittingId, codeA)).toBe(0)
    expect(await noticeRows(admin, sittingId, codeB)).toBe(0)

    await setDeleted(admin, [studentIds[0] as string], new Date().toISOString(), track.adminId)

    const body = await invoke({ sittingId })
    expect(body).toContain('"success":true')
    // CONTROL: B (active) is attempted; A is not.
    expect(attempted(body), body).toBe(1)
    expect(await noticeRows(admin, sittingId, codeA)).toBe(0)
    if (SENDS) expect(await noticeRows(admin, sittingId, codeB)).toBe(1)
    else {
      const names = await admin
        .from('users')
        .select('id, full_name')
        .in('id', [studentIds[0] as string, studentIds[1] as string])
      if (names.error) throw new Error(`names: ${names.error.message}`)
      const nameA = names.data?.find((u) => u.id === studentIds[0])?.full_name as string
      const nameB = names.data?.find((u) => u.id === studentIds[1])?.full_name as string
      expect(nameA).toBeTruthy()
      expect(nameB).toBeTruthy()
      expect(body).toContain('"sent":0')
      expect(body.match(/"studentName"/g)?.length).toBe(1)
      expect(body).toContain(`"studentName":${JSON.stringify(nameB)}`)
      expect(body).not.toContain(nameA)
    }
  })
})
