/**
 * Red Team Spec: legacy void_internal_exam_code on a sitting code (Vector NJ, #1832)
 *
 * Attack: the egmont admin calls void_internal_exam_code directly (PostgREST) on a live sitting
 * code, bypassing voidInternalExamCode's sitting_entry_id refusal and void_sitting_code's sitting
 * lock and state checks.
 * Expected: refused; the code stays unvoided and no `internal_exam.code_voided` audit row exists.
 * CONTROL: the same RPC voids a legacy code (sitting_entry_id NULL) of another throwaway student.
 *
 * Skipped: proven gap; the DB refusal is planned for PR 2e (`.work/invigilation/slice2-plan.md`).
 *
 * Hermetic: throwaway students; sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the
 * created codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { skipNearUtcRollover } from '../helpers/utc-rollover'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NJ_STUDENT_EMAIL = 'redteam-nj-student@lmsplus.local'
const NJ_STUDENT_PASSWORD = 'redteam-nj-student-2026!'
const NJ_LEGACY_EMAIL = 'redteam-nj-legacy@lmsplus.local'
const NJ_LEGACY_PASSWORD = 'redteam-nj-legacy-2026!'
const NJ_REASON = '[E2E_REDTEAM_NJ] legacy void probe'

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code: ${error?.message}`)
  const { data: audits, error: aErr } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'internal_exam.code_voided')
    .eq('resource_id', codeId)
  if (aErr || !audits) throw new Error(`audit: ${aErr?.message}`)
  return { voided: data.voided_at !== null, audits: audits.length }
}

test.describe('Red Team: legacy void refuses a sitting code (NJ)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let studentId: string
  let legacyStudentId: string
  let sittingCodeId: string
  let legacyCodeId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    skipNearUtcRollover()
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NJ_STUDENT_EMAIL, NJ_STUDENT_PASSWORD, a.orgId)
    legacyStudentId = await upsertUser(admin, NJ_LEGACY_EMAIL, NJ_LEGACY_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)

    const sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
    const add = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
      p_subject_ids: [picked.subjectId],
    })
    if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
    const iss = await egmontAdmin.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    if (iss.error) throw new Error(`issue: ${iss.error.message}`)
    expect(iss.data?.[0]?.issued).toBe(1)
    const { data: codes, error: cErr } = await admin
      .from('internal_exam_codes')
      .select('id, sitting_entry_id')
      .eq('student_id', studentId)
      .not('sitting_entry_id', 'is', null)
      .is('voided_at', null)
      .is('deleted_at', null)
    if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    sittingCodeId = codes[0]?.id as string

    const leg = await egmontAdmin.rpc('issue_internal_exam_code', {
      p_subject_id: picked.subjectId,
      p_student_id: legacyStudentId,
    })
    const legRow = Array.isArray(leg.data) ? leg.data[0] : null
    if (leg.error || typeof legRow?.code_id !== 'string') {
      throw new Error(`legacy issue: ${leg.error?.message ?? 'no row'}`)
    }
    legacyCodeId = legRow.code_id
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .in('student_id', [studentId, legacyStudentId].filter(Boolean))
        .is('deleted_at', null)
      if (error) throw new Error(`codes: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NJ afterAll: ${errors.join('; ')}`)
  })

  // Skipped until `void_internal_exam_code` refuses a `sitting_entry_id` code (#1832).
  test.skip('NJ: void_internal_exam_code refuses a sitting code', async () => {
    expect(await codeState(admin, sittingCodeId)).toEqual({ voided: false, audits: 0 })

    const { data, error } = await egmontAdmin.rpc('void_internal_exam_code', {
      p_code_id: sittingCodeId,
      p_reason: NJ_REASON,
    })
    expect(error?.message ?? `no error ${JSON.stringify(data)}`).toMatch(/sitting|code_not_found/)
    expect(await codeState(admin, sittingCodeId)).toEqual({ voided: false, audits: 0 })

    // CONTROL: a legacy code (sitting_entry_id NULL) is voided by the same RPC.
    expect(await codeState(admin, legacyCodeId)).toEqual({ voided: false, audits: 0 })
    const ok = await egmontAdmin.rpc('void_internal_exam_code', {
      p_code_id: legacyCodeId,
      p_reason: NJ_REASON,
    })
    expect(ok.error).toBeNull()
    expect(await codeState(admin, legacyCodeId)).toEqual({ voided: true, audits: 1 })
  })
})
