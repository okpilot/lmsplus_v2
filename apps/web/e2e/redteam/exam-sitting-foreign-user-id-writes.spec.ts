/**
 * Red Team Spec: foreign user ids in the two sitting WRITE RPCs (Vector NE, #1777)
 *
 * NE: the `addCandidates` / `addSittingExams` Server Actions pass client-supplied `userIds` to
 * `add_exam_sitting_candidates` / `add_exam_sitting_entries` with no org or candidate pre-filter —
 * `AddSittingCandidatesSchema` / `AddSittingExamsSchema` check UUID shape only, and the `all: true`
 * path is the only one routed through `candidateIds()`. The egmont admin therefore reaches both RPCs
 * with a cross-org user id in their OWN sitting. Expected: `add_exam_sitting_candidates` raises
 * `student_not_found` and writes nothing, including for the valid half of a mixed array;
 * `add_exam_sitting_entries` classifies the foreign id `not_candidate` and inserts no row.
 * CONTROL: the same two calls with the egmont student write a candidate row and an entry row, so a
 * passing denial arm is the org/candidate gate and not a blanket refusal.
 *
 * Distinct from ND (`exam-sitting-foreign-param-injection.spec.ts`), which pins the foreign-GROUP
 * path of `add_exam_sitting_candidates` and the three READ RPCs gated by
 * `private.sitting_resolve_user_ids`. The gates here are different mechanisms:
 * `private.resolve_sitting_students` (org + role + live check -> `student_not_found`) and the
 * `v_cand` candidate array in `private.add_sitting_entries_core` (-> `not_candidate`).
 *
 * Hermetic: throwaway egmont student; the sitting carries EXAM_SITTING_E2E_PREFIX; afterAll runs
 * cleanupSittingFixtures (entries, candidates, sitting), per-step accumulator inside the helper.
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
  createCrossOrgUser,
  seedRedTeamAdmin,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NE_STUDENT_EMAIL = 'redteam-ne-student@lmsplus.local'
const NE_STUDENT_PASSWORD = 'redteam-ne-student-2026!'

async function liveCandidates(admin: Admin, sittingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('exam_sitting_candidates')
    .select('user_id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (error) throw new Error(`candidates: ${error.message}`)
  return (data ?? []).map((r) => r.user_id).sort()
}

async function livePairs(admin: Admin, sittingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('exam_sitting_entries')
    .select('user_id, subject_id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (error) throw new Error(`entries: ${error.message}`)
  return (data ?? []).map((r) => `${r.user_id}:${r.subject_id}`).sort()
}

function skipReasons(raw: unknown): string[] {
  return ((Array.isArray(raw) ? raw : []) as { user_id?: string; reason?: string }[]).map(
    (r) => `${r.user_id ?? ''}:${r.reason ?? ''}`,
  )
}

test.describe('Red Team: foreign user ids in the sitting write RPCs (NE)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let studentId: string
  let crossUserId: string
  let subjectId: string
  let sittingId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NE_STUDENT_EMAIL, NE_STUDENT_PASSWORD, a.orgId)
    const cross = await createCrossOrgUser()
    crossUserId = cross.userId
    expect(crossUserId).not.toBe(studentId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(a.orgId, subjectId, picked.topicId)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
  })

  test.afterAll(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('NE: a cross-org user id writes no candidate and no entry in the admin own sitting', async () => {
    // The victim exists and is live, so every denial below is the org gate, not a missing row.
    const { data: victim, error: victimErr } = await admin
      .from('users')
      .select('id, organization_id, role, deleted_at')
      .eq('id', crossUserId)
      .single()
    expect(victimErr).toBeNull()
    expect(victim?.role).toBe('student')
    expect(victim?.deleted_at).toBeNull()

    const foreignOnly = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [crossUserId],
    })
    expect(foreignOnly.error?.message ?? 'no error').toMatch(/student_not_found/)
    expect(await liveCandidates(admin, sittingId)).toEqual([])

    // Mixed array: the valid half must not be written either.
    const mixedAdd = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId, crossUserId],
    })
    expect(mixedAdd.error?.message ?? 'no error').toMatch(/student_not_found/)
    expect(await liveCandidates(admin, sittingId)).toEqual([])

    // CONTROL: the egmont student alone IS added — the denials above are the org gate.
    const ownAdd = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
    })
    expect(ownAdd.error).toBeNull()
    expect(ownAdd.data).toEqual([{ added: 1, skipped_existing: 0, skipped_deactivated: 0 }])
    expect(await liveCandidates(admin, sittingId)).toEqual([studentId])

    const foreignEntry = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [crossUserId],
      p_subject_ids: [subjectId],
    })
    expect(foreignEntry.error).toBeNull()
    const fRow = foreignEntry.data?.[0]
    expect(fRow?.added, JSON.stringify(foreignEntry.data)).toBe(0)
    expect(fRow?.skipped_not_candidate).toBe(1)
    expect(skipReasons(fRow?.skipped)).toEqual([`${crossUserId}:not_candidate`])
    expect(await livePairs(admin, sittingId)).toEqual([])

    // Mixed pairs: the own pair lands (CONTROL), the foreign pair is classified and dropped.
    const mixedEntry = await egmontAdmin.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId, crossUserId],
      p_subject_ids: [subjectId, subjectId],
    })
    expect(mixedEntry.error).toBeNull()
    const mRow = mixedEntry.data?.[0]
    expect(mRow?.added, JSON.stringify(mixedEntry.data)).toBe(1)
    expect(mRow?.skipped_not_candidate).toBe(1)
    expect(skipReasons(mRow?.skipped)).toEqual([`${crossUserId}:not_candidate`])
    expect(await livePairs(admin, sittingId)).toEqual([`${studentId}:${subjectId}`])

    // No cross-org row anywhere in the sitting, with the own rows present as the control.
    expect(await liveCandidates(admin, sittingId)).toEqual([studentId])
    const { data: anyCross, error: crossErr } = await admin
      .from('exam_sitting_entries')
      .select('id')
      .eq('user_id', crossUserId)
      .eq('sitting_id', sittingId)
    expect(crossErr).toBeNull()
    expect(anyCross ?? []).toHaveLength(0)
  })
})
