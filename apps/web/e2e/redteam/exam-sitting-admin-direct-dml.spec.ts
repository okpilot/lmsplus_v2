/**
 * Red Team Spec: an admin's direct writes to sitting entries and sitting codes are refused (Vector MS, #1777)
 *
 * Attack: an admin with a real JWT bypasses add_exam_sitting_entries / issue_sitting_exam_codes /
 * remove_exam_sitting_entries through PostgREST: INSERTs an entry into a second sitting, soft-deletes
 * a live entry without voiding its code, INSERTs a sitting code, restamps a live code's expires_at,
 * and un-voids a code that remove_exam_sitting_entries voided.
 * Expected: every write 42501 `permission denied`; entry and code rows unchanged; the student's
 * redeem of the un-voided code is `code_voided`.
 * CONTROL: the same admin client reads the entry and code; remove_exam_sitting_entries voids the code
 * (codes_voided 1) and soft-deletes the entry.
 *
 * Hermetic: throwaway student; sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the
 * created codes and sessions, then cleanupSittingFixtures (per-step accumulator).
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
import { ADMIN_EMAIL, ADMIN_PASSWORD, seedRedTeamAdmin } from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const MS_STUDENT_EMAIL = 'redteam-ms-student@lmsplus.local'
const MS_STUDENT_PASSWORD = 'redteam-ms-student-2026!'
const DENIED = /permission denied/

type CodeRow = {
  id: string
  code: string
  expires_at: string
  voided_at: string | null
  consumed_at: string | null
}

async function codeRow(admin: Admin, codeId: string): Promise<CodeRow> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, code, expires_at, voided_at, consumed_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code read: ${error?.message}`)
  return data as CodeRow
}

async function liveEntries(admin: Admin, sittingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('exam_sitting_entries')
    .select('id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (error || !data) throw new Error(`entries: ${error?.message}`)
  return data.map((r) => r.id as string)
}

async function sittingCodeCount(admin: Admin, entryId: string): Promise<number> {
  const { count, error } = await admin
    .from('internal_exam_codes')
    .select('id', { count: 'exact', head: true })
    .eq('sitting_entry_id', entryId)
  if (error) throw new Error(`code count: ${error.message}`)
  return count ?? 0
}

test.describe('Red Team: admin direct DML on sitting entries and codes (MS)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let student: SupabaseClient
  let adminId: string
  let orgId: string
  let studentId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  const codeIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    adminId = a.adminUserId
    orgId = a.orgId
    track.adminId = adminId
    studentId = await upsertUser(admin, MS_STUDENT_EMAIL, MS_STUDENT_PASSWORD, orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    student = await createAuthenticatedClient(MS_STUDENT_EMAIL, MS_STUDENT_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .eq('student_id', studentId)
        .eq('mode', 'internal_exam')
        .is('deleted_at', null)
      if (error) throw new Error(`sessions: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (codeIds.length > 0) {
        const { error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: now })
          .in('id', codeIds)
          .is('deleted_at', null)
        if (error) throw new Error(`codes: ${error.message}`)
      }
      codeIds.length = 0
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MS afterEach: ${errors.join('; ')}`)
  })

  test('MS: entry and code writes outside the sitting RPCs are refused; un-voided code stays voided', async () => {
    const sittingId = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(sittingId)
    const other = await createSittingRpc(
      adminClient,
      adminId,
      new Date(Date.now() + 24 * 3600 * 1000),
    )
    track.sittingIds.push(other)
    for (const sid of [sittingId, other]) {
      const c = await adminClient.rpc('add_exam_sitting_candidates', {
        p_sitting_id: sid,
        p_user_ids: [studentId],
      })
      expect(c.error, `candidates ${sid}`).toBeNull()
    }
    const ent = await adminClient.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
      p_subject_ids: [subjectId],
    })
    expect(ent.error).toBeNull()
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
    const iss = await adminClient.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    expect(iss.error).toBeNull()
    expect(iss.data?.[0]?.issued, JSON.stringify(iss.data)).toBe(1)

    const [entryId] = await liveEntries(admin, sittingId)
    if (!entryId) throw new Error('no entry')
    const { data: live, error: liveErr } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('sitting_entry_id', entryId)
      .is('voided_at', null)
      .is('deleted_at', null)
      .single()
    if (liveErr || !live) throw new Error(`live code: ${liveErr?.message}`)
    const codeId = live.id as string
    codeIds.push(codeId)
    const before = await codeRow(admin, codeId)

    // CONTROL: the admin JWT client reaches both tables.
    const seeEntry = await adminClient.from('exam_sitting_entries').select('id').eq('id', entryId)
    expect(seeEntry.error).toBeNull()
    expect(seeEntry.data?.length).toBe(1)
    const seeCode = await adminClient.from('internal_exam_codes').select('id').eq('id', codeId)
    expect(seeCode.error).toBeNull()
    expect(seeCode.data?.length).toBe(1)

    const insEntry = await adminClient.from('exam_sitting_entries').insert({
      organization_id: orgId,
      sitting_id: other,
      user_id: studentId,
      subject_id: subjectId,
    })
    expect(insEntry.error?.message ?? 'entry insert accepted').toMatch(DENIED)
    expect(await liveEntries(admin, other)).toEqual([])

    const delEntry = await adminClient
      .from('exam_sitting_entries')
      .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
      .eq('id', entryId)
    expect(delEntry.error?.message ?? 'entry soft-delete accepted').toMatch(DENIED)
    expect(await liveEntries(admin, sittingId)).toEqual([entryId])

    const codesBefore = await sittingCodeCount(admin, entryId)
    const insCode = await adminClient.from('internal_exam_codes').insert({
      code: 'MSZZZZZZ',
      subject_id: subjectId,
      student_id: studentId,
      issued_by: adminId,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      organization_id: orgId,
      sitting_entry_id: entryId,
    })
    expect(insCode.error?.message ?? 'code insert accepted').toMatch(DENIED)
    expect(await sittingCodeCount(admin, entryId)).toBe(codesBefore)

    const restamp = await adminClient
      .from('internal_exam_codes')
      .update({ expires_at: '2099-01-01T00:00:00Z' })
      .eq('id', codeId)
    expect(restamp.error?.message ?? 'restamp accepted').toMatch(DENIED)
    expect((await codeRow(admin, codeId)).expires_at).toBe(before.expires_at)

    // CONTROL: the sanctioned remove path voids the code and soft-deletes the entry.
    const rm = await adminClient.rpc('remove_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_entry_ids: [entryId],
    })
    expect(rm.error).toBeNull()
    expect(rm.data?.[0]?.codes_voided).toBe(1)
    expect(await liveEntries(admin, sittingId)).toEqual([])
    const voided = await codeRow(admin, codeId)
    expect(voided.voided_at).not.toBeNull()

    const unvoid = await adminClient
      .from('internal_exam_codes')
      .update({ voided_at: null, voided_by: null, void_reason: null })
      .eq('id', codeId)
    expect(unvoid.error?.message ?? 'un-void accepted').toMatch(DENIED)
    expect((await codeRow(admin, codeId)).voided_at).toBe(voided.voided_at)

    const { data: started, error: startErr } = await student.rpc('start_internal_exam_session', {
      p_code: before.code,
    })
    expect(startErr?.message ?? `started ${JSON.stringify(started)}`).toMatch(/code_voided/)
    expect((await codeRow(admin, codeId)).consumed_at).toBeNull()
  })
})
