/**
 * Red Team Spec: concurrent sendSittingNotices replays email each notice once (Vector NR, #1777)
 *
 * deliverPendingNotices reads the pending list, sends, then records `notice_emailed`;
 * record_exam_sitting_notice inserts without a uniqueness check.
 * Attack: the egmont admin fires 2 sendSittingNotices replays in parallel for a cancelled sitting
 * holding 2 pending cancellation notices.
 * Expected: the 2 responses attempt 2 notices in total; each code has 1 notice row.
 * CONTROL: 2 SEQUENTIAL replays on a second such sitting attempt 2 then 0 (recording dedupes).
 * Local only (`next dev`, no RESEND_API_KEY): on CI sends fail, nothing is recorded, and every
 * replay re-attempts by design.
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
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

type Admin = ReturnType<typeof getAdminClient>

const BASE_URL = 'http://localhost:3000'
const NR_EMAILS = [
  'redteam-nr-student-a@lmsplus.local',
  'redteam-nr-student-b@lmsplus.local',
  'redteam-nr-student-c@lmsplus.local',
]
const NR_PASSWORD = 'redteam-nr-student-2026!'
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

test.describe('Red Team: concurrent sendSittingNotices replays (NR)', () => {
  test.setTimeout(180_000)
  test.skip(!SENDS, 'CI build has no email transport: failed sends are re-attempted by design')

  let admin: Admin
  let adminCtx: BrowserContext
  let headers: Record<string, string>
  let actionId: string
  let decoyId: string
  let raceId: string
  let controlId: string
  let raceCodes: string[] = []
  let controlCodes: string[] = []
  let studentIds: string[] = []
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
    for (const email of NR_EMAILS)
      studentIds.push(await upsertUser(admin, email, NR_PASSWORD, a.orgId))
    await setDeleted(admin, studentIds, null, null)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    const egmont = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    decoyId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(decoyId)
    raceId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(raceId)
    controlId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(controlId)
    const pair = studentIds.slice(0, 2)
    await cancelledSittingWithEmailedCodes(
      admin,
      egmont,
      decoyId,
      [studentIds[2] as string],
      picked.subjectId,
    )
    raceCodes = [
      ...(
        await cancelledSittingWithEmailedCodes(admin, egmont, raceId, pair, picked.subjectId)
      ).values(),
    ]
    controlCodes = [
      ...(
        await cancelledSittingWithEmailedCodes(admin, egmont, controlId, pair, picked.subjectId)
      ).values(),
    ]

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
    if (errors.length > 0) throw new Error(`NR afterAll: ${errors.join('; ')}`)
  })

  // GAP #1847
  test.skip('NR: parallel replays email each pending notice once', async () => {
    expect(raceCodes).toHaveLength(2)
    expect(controlCodes).toHaveLength(2)

    // CONTROL: sequential replays attempt 2, then 0.
    const first = await invoke({ sittingId: controlId })
    expect(attempted(first), first).toBe(2)
    const second = await invoke({ sittingId: controlId })
    expect(attempted(second), second).toBe(0)
    for (const c of controlCodes) expect(await noticeRows(admin, controlId, c)).toBe(1)

    const bodies = await Promise.all([invoke({ sittingId: raceId }), invoke({ sittingId: raceId })])
    expect(
      bodies.reduce((n, b) => n + attempted(b), 0),
      bodies.join('\n'),
    ).toBe(2)
    for (const c of raceCodes) expect(await noticeRows(admin, raceId, c)).toBe(1)
  })
})
