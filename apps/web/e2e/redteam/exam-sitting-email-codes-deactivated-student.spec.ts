/**
 * Red Team Spec: sitting code email never reaches a deactivated student (Vector NO, #1777)
 *
 * Deactivation (toggle-student-status-mutations.ts) sets `users.deleted_at` and voids no code, so
 * the student's sitting code stays live. Both email actions read through adminClient (RLS
 * bypassed); the `users.deleted_at` filter is manual (email-queries.ts).
 * Attack: deactivate student A after codes are issued, then replay emailSittingCodes for the
 * sitting and sendInternalExamCodeEmail for A's code.
 * Expected: A's code keeps `emailed_at` NULL and has no `internal_exam.code_emailed` audit row;
 * the bulk reports A as skipped; the per-code replay answers 'Code not found'.
 * CONTROL: the same bulk replay sends and stamps active student B's code (`"sent":1`). CI is a
 * production build without a Resend key, so on CI the control asserts the post-guard failed send
 * (B listed as failed, nothing stamped) instead of delivery.
 *
 * Hermetic: throwaway students (A re-activated in beforeAll), sittings carry
 * EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the created codes, then cleanupSittingFixtures
 * (per-step accumulator).
 */

import { type BrowserContext, expect, test } from '@playwright/test'
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
const NO_A_EMAIL = 'redteam-no-student-a@lmsplus.local'
const NO_B_EMAIL = 'redteam-no-student-b@lmsplus.local'
const NO_PASSWORD = 'redteam-no-student-2026!'

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

test.describe('Red Team: sitting code email skips a deactivated student (NO)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let egmontAdmin: SupabaseClient
  let adminCtx: BrowserContext
  let headers: Record<string, string>
  let bulkId: string
  let singleId: string
  let emptySittingId: string
  let sittingId: string
  let studentIds: string[] = []
  let codeA: string
  let codeB: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  const invoke = (id: string, arg: Record<string, unknown>) =>
    postServerAction(adminCtx.request, {
      url: `${BASE_URL}/app/admin/internal-exams/sittings/${emptySittingId}`,
      headers,
      id,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentIds = [
      await upsertUser(admin, NO_A_EMAIL, NO_PASSWORD, a.orgId),
      await upsertUser(admin, NO_B_EMAIL, NO_PASSWORD, a.orgId),
    ]
    // A prior run leaves A deactivated; candidates/entries need an active student.
    const { error: reErr } = await admin
      .from('users')
      .update({ deleted_at: null, deleted_by: null })
      .in('id', studentIds)
    if (reErr) throw new Error(`reactivate: ${reErr.message}`)
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

    adminCtx = await browser.newContext({ storageState: undefined })
    await adminCtx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(a.adminUserId), url: BASE_URL },
    ])
    const page = await adminCtx.newPage()
    await signInViaForm(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(`/app/admin/internal-exams/sittings/${emptySittingId}`)
    await page.getByRole('button', { name: 'Email codes' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Email codes' }).click()
    await expect(page.getByText(/Emailed 0/)).toBeVisible({ timeout: 15_000 })
    const ids = await watch.settle()
    await page.close()
    const h = watch.headers()
    const bulk = ids.get('emailSittingCodes')
    const single = ids.get('sendInternalExamCodeEmail')
    if (!h || !bulk || !single) throw new Error(`actions not captured: ${[...ids.keys()]}`)
    expect(h['next-action']).toBe(bulk)
    headers = h
    bulkId = bulk
    singleId = single
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
    if (errors.length > 0) throw new Error(`NO afterAll: ${errors.join('; ')}`)
  })

  test('NO: a deactivated student with a live sitting code is never emailed; an active peer is', async () => {
    const none = { emailed: false, audits: 0 }
    const once = { emailed: true, audits: 1 }
    expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])

    const { data: deact, error: dErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString(), deleted_by: track.adminId })
      .eq('id', studentIds[0])
      .select('id')
    if (dErr || deact?.length !== 1) throw new Error(`deactivate: ${dErr?.message}`)
    // The code stays live: deactivation voids nothing.
    const { data: live, error: lErr } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('id', codeA)
      .is('voided_at', null)
      .is('consumed_at', null)
      .is('deleted_at', null)
    if (lErr) throw new Error(`live: ${lErr.message}`)
    expect(live).toHaveLength(1)

    const single = await invoke(singleId, { codeId: codeA })
    expect(single).not.toContain('"success":true')
    expect(single).toContain('Code not found')
    expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])

    // CONTROL: the same bulk replay sends B (active) only; A is counted as skipped.
    const bulk = await invoke(bulkId, { sittingId })
    expect(bulk).toContain('"success":true')
    expect(bulk).toContain('"skipped":1')
    expect(bulk).toContain('"unrecorded":0')
    if (process.env.CI) {
      expect(bulk).toContain('"sent":0')
      expect(bulk.match(/"studentName"/g)).toHaveLength(1)
      expect(bulk).toContain(`Red Team ${NO_B_EMAIL.split('@')[0]}`)
      expect(await emailState(admin, [codeA, codeB])).toEqual([none, none])
    } else {
      expect(bulk).toContain('"sent":1')
      expect(bulk).toContain('"failed":[]')
      expect(await emailState(admin, [codeA, codeB])).toEqual([none, once])
    }
  })
})
