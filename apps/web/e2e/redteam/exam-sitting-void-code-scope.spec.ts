/**
 * Red Team Spec: void_sitting_code scope (Vector MY, #1777)
 *
 * Attack: a cross-org admin, a student, an instructor and a soft-deleted admin with a live JWT call
 * void_sitting_code on an egmont sitting's live code; the egmont admin pairs that code with a
 * second, editable egmont sitting id.
 * Expected: cross-org `sitting_not_found`, the others `not_admin`, the mismatched pair
 * `code_not_found`; the code stays unvoided and no `internal_exam.code_voided` audit row exists.
 * CONTROL: the egmont admin with the owning sitting id voids it (one audit row); a repeat is
 * `code_voided`.
 *
 * Hermetic: throwaway students and soft-deleted admin; sittings carry EXAM_SITTING_E2E_PREFIX;
 * afterAll soft-deletes the created codes, then cleanupSittingFixtures (per-step accumulator).
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
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const MY_STUDENT_EMAIL = 'redteam-my-student@lmsplus.local'
const MY_STUDENT_PASSWORD = 'redteam-my-student-2026!'
const MY_SOFTDEL_EMAIL = 'redteam-my-softdel-admin@lmsplus.local'
const MY_SOFTDEL_PASSWORD = 'redteam-my-softdel-admin-2026!'
const MY_REASON = '[E2E_REDTEAM_MY] void probe'

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at, consumed_at, deleted_at')
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

test.describe('Red Team: void_sitting_code scope (MY)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let callers: [string, SupabaseClient, RegExp][]
  let studentId: string
  let sittingId: string
  let otherSittingId: string
  let codeId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, MY_STUDENT_EMAIL, MY_STUDENT_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    const softId = await upsertUser(admin, MY_SOFTDEL_EMAIL, MY_SOFTDEL_PASSWORD, a.orgId, 'admin')
    const { error: liveErr } = await admin
      .from('users')
      .update({ deleted_at: null })
      .eq('id', softId)
    if (liveErr) throw new Error(`softdel revive: ${liveErr.message}`)
    const softDel = await createAuthenticatedClient(MY_SOFTDEL_EMAIL, MY_SOFTDEL_PASSWORD)
    const { data: del, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softId)
      .select('id')
    if (delErr || !del?.length) throw new Error(`softdel: ${delErr?.message ?? '0 rows'}`)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    callers = [
      [
        'cross-org admin',
        await createAuthenticatedClient(cross.email, cross.password),
        /sitting_not_found/,
      ],
      ['student', await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD), /not_admin/],
      ['instructor', await createAuthenticatedClient(ins.email, ins.password), /not_admin/],
      ['soft-deleted admin', softDel, /not_admin/],
    ]

    sittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(sittingId)
    otherSittingId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(otherSittingId)
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
    const { data: entries, error: eErr } = await admin
      .from('exam_sitting_entries')
      .select('id')
      .eq('sitting_id', sittingId)
      .is('deleted_at', null)
    if (eErr || entries?.length !== 1)
      throw new Error(`entries: ${eErr?.message ?? entries?.length}`)
    const { data: codes, error: cErr } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('sitting_entry_id', entries[0]?.id as string)
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
    if (errors.length > 0) throw new Error(`MY afterAll: ${errors.join('; ')}`)
  })

  test('MY: foreign callers and a mismatched sitting cannot void a live code', async () => {
    expect(await codeState(admin, codeId)).toEqual({ voided: false, audits: 0 })

    for (const [who, client, token] of callers) {
      const { data, error } = await client.rpc('void_sitting_code', {
        p_sitting_id: sittingId,
        p_code_id: codeId,
        p_reason: MY_REASON,
      })
      expect(error?.message ?? `${who}: no error ${JSON.stringify(data)}`, who).toMatch(token)
    }
    const mismatch = await egmontAdmin.rpc('void_sitting_code', {
      p_sitting_id: otherSittingId,
      p_code_id: codeId,
      p_reason: MY_REASON,
    })
    expect(mismatch.error?.message ?? 'mismatch: no error').toMatch(/code_not_found/)
    expect(await codeState(admin, codeId)).toEqual({ voided: false, audits: 0 })

    // CONTROL: the owning sitting id voids it once; a repeat is refused.
    const ok = await egmontAdmin.rpc('void_sitting_code', {
      p_sitting_id: sittingId,
      p_code_id: codeId,
      p_reason: MY_REASON,
    })
    expect(ok.error).toBeNull()
    expect(ok.data?.[0]?.code_id).toBe(codeId)
    expect(await codeState(admin, codeId)).toEqual({ voided: true, audits: 1 })
    const again = await egmontAdmin.rpc('void_sitting_code', {
      p_sitting_id: sittingId,
      p_code_id: codeId,
      p_reason: MY_REASON,
    })
    expect(again.error?.message ?? 'repeat: no error').toMatch(/code_voided/)
    expect(await codeState(admin, codeId)).toEqual({ voided: true, audits: 1 })
  })
})
