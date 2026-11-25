/**
 * Red Team Spec: void_sitting_code reserved void-reason tokens (Vector NA, #1777)
 *
 * Attack: the owning org admin calls void_sitting_code on a live sitting code with each token the
 * sitting RPCs themselves write to internal_exam_codes.void_reason — 'sitting_closed',
 * 'sitting_cancelled', 'entry_removed', 'reissued_after_expiry', 'passed_elsewhere'. Three readers
 * key on 'sitting_cancelled' (migs 20261117001000, 20261117001100, 20261117001200), so free text
 * equal to one forges system state.
 * Expected: every token raises `invalid_input`; the code stays unvoided with a NULL void_reason and
 * no `internal_exam.code_voided` audit row.
 * CONTROL: the same admin, the same code, a free-text reason — the void DOES happen (one audit row,
 * void_reason is the free text), so the refusals above are the reserved-token check, not a
 * blanket refusal of this fixture.
 *
 * Hermetic: a throwaway student and a sitting carrying EXAM_SITTING_E2E_PREFIX; afterAll
 * soft-deletes the created sitting codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NA_STUDENT_EMAIL = 'redteam-na-student@lmsplus.local'
const NA_STUDENT_PASSWORD = 'redteam-na-student-2026!'
const NA_FREE_TEXT = '[E2E_REDTEAM_NA] wrong person, reissue later'

/** The tokens the sitting RPCs write themselves; mirrored by RESERVED_VOID_REASONS (schema.ts). */
const RESERVED = [
  'sitting_closed',
  'sitting_cancelled',
  'entry_removed',
  'reissued_after_expiry',
  'passed_elsewhere',
] as const

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at, void_reason, deleted_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code: ${error?.message}`)
  const { data: audits, error: aErr } = await admin
    .from('audit_events')
    .select('id')
    .eq('event_type', 'internal_exam.code_voided')
    .eq('resource_id', codeId)
  if (aErr || !audits) throw new Error(`audit: ${aErr?.message}`)
  return { voided: data.voided_at !== null, reason: data.void_reason, audits: audits.length }
}

test.describe('Red Team: void_sitting_code reserved void reasons (NA)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let studentId: string
  let sittingId: string
  let codeId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NA_STUDENT_EMAIL, NA_STUDENT_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
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
      .select('id')
      .eq('student_id', studentId)
      .not('sitting_entry_id', 'is', null)
      .is('voided_at', null)
      .is('deleted_at', null)
    if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    codeId = codes[0]?.id as string
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .not('sitting_entry_id', 'is', null)
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
    if (errors.length > 0) throw new Error(`NA afterAll: ${errors.join('; ')}`)
  })

  test('NA: a system void reason cannot be written as a free-text void reason', async () => {
    expect(await codeState(admin, codeId)).toEqual({ voided: false, reason: null, audits: 0 })

    for (const reason of RESERVED) {
      const { data, error } = await egmontAdmin.rpc('void_sitting_code', {
        p_sitting_id: sittingId,
        p_code_id: codeId,
        p_reason: reason,
      })
      expect(error?.message ?? `${reason}: no error ${JSON.stringify(data)}`, reason).toMatch(
        /invalid_input/,
      )
      expect(await codeState(admin, codeId), reason).toEqual({
        voided: false,
        reason: null,
        audits: 0,
      })
    }

    // CONTROL: the guard's condition absent — a free-text reason voids the very same code.
    const ok = await egmontAdmin.rpc('void_sitting_code', {
      p_sitting_id: sittingId,
      p_code_id: codeId,
      p_reason: NA_FREE_TEXT,
    })
    expect(ok.error).toBeNull()
    expect(ok.data?.[0]?.code_id).toBe(codeId)
    expect(await codeState(admin, codeId)).toEqual({
      voided: true,
      reason: NA_FREE_TEXT,
      audits: 1,
    })
  })
})
