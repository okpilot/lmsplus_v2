/**
 * Red Team Spec: pending sitting notices for a student who left the org (Vector NW, #1777)
 *
 * Attack: an egmont sitting is cancelled after its codes were emailed; the student is then moved
 * to a foreign org (or deactivated). The egmont admin reads get_pending_removal_notices and
 * get_exam_sitting_summary. Expected: the moved / deactivated student's notice is not listed and
 * not counted (private.pending_notice_rows joins users on the caller's org, deleted_at IS NULL),
 * so the egmont sitting's details are never queued for a foreign-org mailbox.
 * CONTROL: while the student is an active egmont member the notice is listed (1 row) and counted (1).
 *
 * Hermetic: throwaway student (realigned to egmont, revived in beforeAll); sittings carry
 * EXAM_SITTING_E2E_PREFIX; afterAll restores the student, soft-deletes the created codes, then
 * cleanupSittingFixtures (per-step accumulator).
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
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NB_EMAIL = 'redteam-nb-student@lmsplus.local'
const NB_PASSWORD = 'redteam-nb-student-2026!'

async function pending(egmont: SupabaseClient, sittingId: string) {
  const rows = await egmont.rpc('get_pending_removal_notices', { p_sitting_id: sittingId })
  if (rows.error) throw new Error(`pending: ${rows.error.message}`)
  const sum = await egmont.rpc('get_exam_sitting_summary', { p_sitting_id: sittingId })
  if (sum.error || !sum.data?.[0]) throw new Error(`summary: ${sum.error?.message ?? 'no row'}`)
  return {
    users: ((rows.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
    count: (sum.data[0] as { pending_removal_notices: number }).pending_removal_notices,
    status: (sum.data[0] as { status: string }).status,
  }
}

test.describe('Red Team: pending notices skip a student who left the org (NW)', () => {
  let admin: Admin
  let egmont: SupabaseClient
  let egmontOrg: string
  let foreignOrg: string
  let studentId: string
  let sittingId: string
  const codeIds: string[] = []
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  async function setStudent(patch: { organization_id?: string; deleted_at?: string | null }) {
    const { data, error } = await admin.from('users').update(patch).eq('id', studentId).select('id')
    if (error || data?.length !== 1) throw new Error(`student: ${error?.message ?? '0 rows'}`)
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const cross = await seedCrossOrgAdmin()
    egmontOrg = a.orgId
    foreignOrg = cross.orgId
    expect(foreignOrg).not.toBe(egmontOrg)
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NB_EMAIL, NB_PASSWORD, egmontOrg)
    await setStudent({ deleted_at: null })
    const picked = await pickSubjectWithQuestions(admin, { orgId: egmontOrg })
    await ensureExamConfig(egmontOrg, picked.subjectId, picked.topicId)

    egmont = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmont, a.adminUserId)
    track.sittingIds.push(sittingId)
    const add = await egmont.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await egmont.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [studentId],
      p_subject_ids: [picked.subjectId],
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
    if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    codeIds.push(...codes.map((c) => c.id))
    const mark = await admin
      .from('internal_exam_codes')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', codeIds)
    if (mark.error) throw new Error(`emailed_at: ${mark.error.message}`)
    const cancel = await egmont.rpc('cancel_exam_sitting', { p_sitting_id: sittingId })
    if (cancel.error) throw new Error(`cancel: ${cancel.error.message}`)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      await setStudent({ organization_id: egmontOrg, deleted_at: null })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (codeIds.length > 0) {
      const { error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', codeIds)
        .is('deleted_at', null)
      if (error) errors.push(`codes: ${error.message}`)
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NW cleanup: ${errors.join('; ')}`)
  })

  test('NW: a moved or deactivated student gets no queued notice; an active one does', async () => {
    const control = await pending(egmont, sittingId)
    expect(control).toEqual({ users: [studentId], count: 1, status: 'cancelled' })

    await setStudent({ organization_id: foreignOrg })
    expect(await pending(egmont, sittingId)).toEqual({ users: [], count: 0, status: 'cancelled' })

    await setStudent({ organization_id: egmontOrg, deleted_at: new Date().toISOString() })
    expect(await pending(egmont, sittingId)).toEqual({ users: [], count: 0, status: 'cancelled' })

    await setStudent({ deleted_at: null })
    expect(await pending(egmont, sittingId)).toEqual(control)
  })
})
