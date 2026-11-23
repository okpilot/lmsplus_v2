/**
 * Red Team Spec: exam sitting tables and lazy close from the student side (Vectors MK, ML, #1777)
 *
 * MK: a student reads exam_sittings, another student's candidate and entry rows, and writes the
 * sitting tables directly; an admin writes exam_sittings directly and reads an ungranted column.
 * Expected: 0 sittings, own rows only, every write and the ungranted column refused, rows unchanged.
 * CONTROL: the student reads its own candidate and entry; the admin reads the sitting.
 *
 * ML: a cross-org student (list_my_active_internal_exam_codes) and a cross-org admin
 * (list_exam_sittings) run the lazy close against an egmont sitting whose UTC day ended.
 * Expected: it stays scheduled. CONTROL: an egmont student's call auto-cancels it.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the tracked entries,
 * candidates and sittings (cleanupSittingFixtures, per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  insertEntry,
  insertSittingRow,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamStudent,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

async function sittingStatus(admin: Admin, id: string): Promise<string> {
  const { data, error } = await admin.from('exam_sittings').select('status').eq('id', id).single()
  if (error || !data) throw new Error(`exam_sittings read: ${error?.message}`)
  return data.status as string
}

test.describe('Red Team: exam sitting student surface (MK, ML)', () => {
  let admin: Admin
  let adminClient: SupabaseClient
  let attacker: SupabaseClient
  let victim: SupabaseClient
  let crossStudent: SupabaseClient
  let crossAdmin: SupabaseClient
  let orgId: string
  let adminId: string
  let attackerId: string
  let victimId: string
  let subjectId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const v = await seedRedTeamStudent()
    const cu = await createCrossOrgUser()
    const ca = await seedCrossOrgAdmin()
    orgId = a.orgId
    adminId = a.adminUserId
    attackerId = users.attackerUserId
    victimId = v.victimUserId
    track.adminId = adminId
    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(v.email, v.password)
    crossStudent = await createAuthenticatedClient(cu.email, cu.password)
    crossAdmin = await createAuthenticatedClient(ca.email, ca.password)
    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id')
      .is('deleted_at', null)
      .order('sort_order')
      .limit(1)
      .single()
    if (subjErr || !subj) throw new Error(`easa_subjects: ${subjErr?.message}`)
    subjectId = subj.id
  })

  test.afterEach(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('MK: a student sees only its own sitting rows and cannot write the sitting tables', async () => {
    const sittingId = await createSittingRpc(adminClient, adminId)
    track.sittingIds.push(sittingId)
    const { error: addErr } = await adminClient.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [attackerId, victimId],
    })
    if (addErr) throw new Error(`add candidates: ${addErr.message}`)
    const ownEntry = await insertEntry(admin, { orgId, sittingId, userId: attackerId, subjectId })
    const victimEntry = await insertEntry(admin, { orgId, sittingId, userId: victimId, subjectId })

    const sit = await attacker.from('exam_sittings').select('id').eq('id', sittingId)
    expect(sit.error).toBeNull()
    expect(sit.data).toEqual([])
    const adminSit = await adminClient.from('exam_sittings').select('id').eq('id', sittingId)
    expect(adminSit.data).toEqual([{ id: sittingId }])

    const cand = await attacker
      .from('exam_sitting_candidates')
      .select('user_id')
      .eq('sitting_id', sittingId)
    expect(cand.error).toBeNull()
    expect(cand.data).toEqual([{ user_id: attackerId }])
    const ent = await attacker.from('exam_sitting_entries').select('id').eq('sitting_id', sittingId)
    expect(ent.error).toBeNull()
    expect(ent.data).toEqual([{ id: ownEntry }])

    const ins = await attacker.from('exam_sitting_entries').insert({
      organization_id: orgId,
      sitting_id: sittingId,
      user_id: attackerId,
      subject_id: subjectId,
    })
    expect(ins.error?.code).toBe('42501')
    const insCand = await attacker
      .from('exam_sitting_candidates')
      .insert({ organization_id: orgId, sitting_id: sittingId, user_id: attackerId })
    expect(insCand.error?.code).toBe('42501')
    const upd = await attacker
      .from('exam_sitting_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', ownEntry)
      .select('id')
    expect(upd.error?.code).toBe('42501')
    const adminUpd = await adminClient
      .from('exam_sittings')
      .update({ started_at: new Date().toISOString(), started_by: adminId })
      .eq('id', sittingId)
      .select('id')
    expect(adminUpd.error?.code).toBe('42501')
    const adminCol = await adminClient
      .from('exam_sittings')
      .select('created_by')
      .eq('id', sittingId)
    expect(adminCol.error?.code).toBe('42501')

    const { data: rows, error: rowsErr } = await admin
      .from('exam_sitting_entries')
      .select('id, deleted_at')
      .in('id', [ownEntry, victimEntry])
      .order('id')
    expect(rowsErr).toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows?.every((r) => r.deleted_at === null)).toBe(true)
    expect(await sittingStatus(admin, sittingId)).toBe('scheduled')
  })

  test('ML: a cross-org caller cannot run the lazy close on an egmont sitting', async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000)
    const sittingId = await insertSittingRow(admin, { orgId, adminId, scheduledAt: yesterday })
    track.sittingIds.push(sittingId)
    expect(await sittingStatus(admin, sittingId)).toBe('scheduled')

    for (let i = 0; i < 3; i++) {
      const { error } = await crossStudent.rpc('list_my_active_internal_exam_codes')
      expect(error).toBeNull()
      const { error: lErr } = await crossAdmin.rpc('list_exam_sittings', { p_scope: 'past' })
      expect(lErr).toBeNull()
    }
    expect(await sittingStatus(admin, sittingId)).toBe('scheduled')

    // CONTROL: same-org student read cancels it (at most 3 sittings per call, so retry).
    let status = 'scheduled'
    for (let i = 0; i < 20 && status === 'scheduled'; i++) {
      const { error } = await victim.rpc('list_my_active_internal_exam_codes')
      expect(error).toBeNull()
      status = await sittingStatus(admin, sittingId)
    }
    expect(status).toBe('cancelled')
    const { data: s, error: sErr } = await admin
      .from('exam_sittings')
      .select('ended_automatically, deleted_by')
      .eq('id', sittingId)
      .single()
    expect(sErr).toBeNull()
    expect(s).toEqual({ ended_automatically: true, deleted_by: adminId })
  })
})
