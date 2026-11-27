/**
 * Red Team Spec: emailSittingCodes / sendInternalExamCodeEmail Server Action scope (Vector NN, #1777)
 *
 * Both actions read through adminClient (RLS bypassed); the org filter is manual.
 * Attack: a cross-org admin replays emailSittingCodes with an egmont sitting id and
 * sendInternalExamCodeEmail with one of its code ids; an egmont student replays emailSittingCodes.
 * Expected: no success; neither code gets `emailed_at`; no `internal_exam.code_emailed` audit row.
 * CONTROL: the egmont admin's identical replays stamp code A (per-code), then code B (bulk; A is
 * already emailed so the bulk sends exactly 1). CI is a production build without a Resend key, so
 * on CI the control asserts the post-guard failed send instead of delivery.
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
const NN_A_EMAIL = 'redteam-nn-student-a@lmsplus.local'
const NN_B_EMAIL = 'redteam-nn-student-b@lmsplus.local'
const NN_PASSWORD = 'redteam-nn-student-2026!'

type Captured = { headers: Record<string, string>; bulk: string; single: string }

async function emailState(admin: Admin, codeIds: string[]) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, emailed_at')
    .in('id', codeIds)
  if (error || data?.length !== codeIds.length) throw new Error(`codes: ${error?.message}`)
  const { data: audits, error: aErr } = await admin
    .from('audit_events')
    .select('resource_id')
    .eq('event_type', 'internal_exam.code_emailed')
    .in('resource_id', codeIds)
  if (aErr || !audits) throw new Error(`audit: ${aErr?.message}`)
  return codeIds.map((id) => ({
    emailed: data.find((r) => r.id === id)?.emailed_at != null,
    audits: audits.filter((a) => a.resource_id === id).length,
  }))
}

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

test.describe('Red Team: sitting code email actions scope (NN)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let egmontAdmin: SupabaseClient
  let adminCtx: BrowserContext
  let crossCtx: BrowserContext
  let studentCtx: BrowserContext
  let cap: Captured
  let emptySittingId: string
  let sittingId: string
  let studentIds: string[] = []
  let codeA: string
  let codeB: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  const invoke = (ctx: BrowserContext, id: string, arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}/app/admin/internal-exams/sittings/${emptySittingId}`,
      headers: cap.headers,
      id,
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
    studentIds = [
      await upsertUser(admin, NN_A_EMAIL, NN_PASSWORD, a.orgId),
      await upsertUser(admin, NN_B_EMAIL, NN_PASSWORD, a.orgId),
    ]
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    emptySittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(emptySittingId)
    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
    const add = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: studentIds,
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: studentIds,
      p_subject_ids: [picked.subjectId, picked.subjectId],
    })
    if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(2)
    const iss = await egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    if (iss.error) throw new Error(`issue: ${iss.error.message}`)
    expect(iss.data?.[0]?.issued).toBe(2)
    const { data: codes, error: cErr } = await admin
      .from('internal_exam_codes')
      .select(
        'id, student_id, exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id)',
      )
      .eq('exam_sitting_entries.sitting_id', sittingId)
      .is('voided_at', null)
      .is('deleted_at', null)
    if (cErr || codes?.length !== 2) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    codeA = codes.find((c) => c.student_id === studentIds[0])?.id as string
    codeB = codes.find((c) => c.student_id === studentIds[1])?.id as string

    adminCtx = await signedInContext(browser, a.adminUserId, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    })
    const page = await adminCtx.newPage()
    const watch = watchServerActions(page)
    await page.goto(`/app/admin/internal-exams/sittings/${emptySittingId}`)
    await page.getByRole('button', { name: 'Email codes' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Email codes' }).click()
    await expect(page.getByText(/Emailed 0/)).toBeVisible({ timeout: 15_000 })
    const ids = await watch.settle()
    await page.close()
    const headers = watch.headers()
    const bulk = ids.get('emailSittingCodes')
    const single = ids.get('sendInternalExamCodeEmail')
    if (!headers || !bulk || !single) throw new Error(`actions not captured: ${[...ids.keys()]}`)
    expect(headers['next-action']).toBe(bulk)
    cap = { headers, bulk, single }

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
    if (errors.length > 0) throw new Error(`NN afterAll: ${errors.join('; ')}`)
  })

  test('NN: cross-org admin and student replays email nothing; the egmont admin replays do', async () => {
    const none = { emailed: false, audits: 0 }
    const once = { emailed: true, audits: 1 }
    expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])

    const crossBulk = await invoke(crossCtx, cap.bulk, { sittingId })
    expect(crossBulk).not.toContain('"success":true')
    expect(crossBulk).toContain('Sitting not found')
    const studentBulk = await invoke(studentCtx, cap.bulk, { sittingId })
    expect(studentBulk).not.toContain('"success":true')
    const crossSingle = await invoke(crossCtx, cap.single, { codeId: codeA })
    expect(crossSingle).not.toContain('"success":true')
    expect(crossSingle).toContain('Code not found')
    expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])

    // CONTROL: the egmont admin's per-code replay stamps A only.
    const okSingle = await invoke(adminCtx, cap.single, { codeId: codeA })
    if (process.env.CI) {
      expect(okSingle).toContain('Failed to send email')
      expect(okSingle).not.toContain('"success":true')
      expect(okSingle).not.toContain('Code not found')
      expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])
    } else {
      expect(okSingle).toContain('"success":true')
      expect(await emailState(admin, [codeA, codeB])).toEqual([once, none])
    }

    // CONTROL: the egmont admin's bulk replay sends B only.
    const okBulk = await invoke(adminCtx, cap.bulk, { sittingId })
    expect(okBulk).toContain('"success":true')
    expect(okBulk).toContain('"skipped":0')
    expect(okBulk).toContain('"unrecorded":0')
    if (process.env.CI) {
      expect(okBulk).toContain('"sent":0')
      expect(okBulk.match(/"studentName"/g)).toHaveLength(2)
      expect(okBulk).toContain(`Red Team ${NN_A_EMAIL.split('@')[0]}`)
      expect(okBulk).toContain(`Red Team ${NN_B_EMAIL.split('@')[0]}`)
      expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])
    } else {
      expect(okBulk).toContain('"sent":1')
      expect(okBulk).toContain('"failed":[]')
      expect(await emailState(admin, [codeA, codeB])).toEqual([once, once])
    }
  })
})
