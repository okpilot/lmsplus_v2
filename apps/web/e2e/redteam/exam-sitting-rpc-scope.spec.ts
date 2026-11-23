/**
 * Red Team Spec: exam sitting RPC scope (Vectors MI, MJ, #1777)
 *
 * MI: a cross-org admin calls every public sitting RPC against an egmont sitting, and
 * create_exam_sitting with an egmont invigilator and add_exam_sitting_candidates with an egmont
 * student. Expected: `sitting_not_found` / `invigilator_not_found` / `student_not_found`; the egmont
 * sitting and its candidate are unchanged; list_exam_sittings omits the egmont sitting.
 * CONTROL: the cross-org admin's own sitting is listed; the egmont admin reads the egmont summary.
 *
 * MJ: a student, an instructor and a soft-deleted admin holding a live JWT call every public sitting
 * RPC. Expected: `not_admin`. CONTROL: the egmont admin's summary call succeeds.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the tracked ones (cleanupSittingFixtures,
 * per-step accumulator). The throwaway soft-deleted admin stays soft-deleted.
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
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamStudent,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>
type Call = { fn: string; args: Record<string, unknown> }

const SOFTDEL_ADMIN_EMAIL = 'redteam-sit-softdel-admin@lmsplus.local'
const SOFTDEL_ADMIN_PASSWORD = 'redteam-sit-softdel-admin-2026!'
const ZERO = '00000000-0000-0000-0000-000000000000'

function sittingCalls(sittingId: string, userId: string): Call[] {
  const s = { p_sitting_id: sittingId }
  return [
    { fn: 'update_exam_sitting', args: { ...s, p_mode: 'in_person' } },
    { fn: 'start_exam_sitting', args: s },
    { fn: 'close_exam_sitting', args: s },
    { fn: 'cancel_exam_sitting', args: s },
    { fn: 'add_exam_sitting_candidates', args: { ...s, p_user_ids: [userId] } },
    { fn: 'remove_exam_sitting_candidates', args: { ...s, p_user_ids: [userId] } },
    { fn: 'remove_exam_sitting_entries', args: { ...s, p_entry_ids: [ZERO] } },
    { fn: 'get_exam_sitting_summary', args: s },
    { fn: 'get_pending_removal_notices', args: s },
    { fn: 'list_exam_sitting_people', args: s },
    { fn: 'get_exam_sitting_group_add_counts', args: { ...s, p_group_id: ZERO } },
    { fn: 'get_exam_sitting_same_day_people', args: s },
    { fn: 'record_exam_sitting_notice', args: { ...s, p_kind: 'changed', p_code_ids: [ZERO] } },
  ]
}

async function sittingState(admin: Admin, sittingId: string) {
  const { data, error } = await admin
    .from('exam_sittings')
    .select('mode, status, deleted_at, started_at')
    .eq('id', sittingId)
    .single()
  if (error || !data) throw new Error(`exam_sittings read: ${error?.message}`)
  const { count, error: cErr } = await admin
    .from('exam_sitting_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (cErr) throw new Error(`candidates count: ${cErr.message}`)
  return { ...data, candidates: count ?? 0 }
}

test.describe('Red Team: exam sitting RPC scope (MI, MJ)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let crossAdmin: SupabaseClient
  let student: SupabaseClient
  let instructor: SupabaseClient
  let softDelAdmin: SupabaseClient
  let egmontAdminId: string
  let victimId: string
  let crossAdminId: string
  let sittingId: string
  let crossSittingId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const v = await seedRedTeamStudent()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    await createCrossOrgUser()
    egmontAdminId = a.adminUserId
    victimId = v.victimUserId
    crossAdminId = cross.adminUserId
    track.adminId = egmontAdminId

    const softId = await upsertUser(
      admin,
      SOFTDEL_ADMIN_EMAIL,
      SOFTDEL_ADMIN_PASSWORD,
      a.orgId,
      'admin',
    )
    const { error: liveErr } = await admin
      .from('users')
      .update({ deleted_at: null })
      .eq('id', softId)
    if (liveErr) throw new Error(`softdel admin revive: ${liveErr.message}`)
    softDelAdmin = await createAuthenticatedClient(SOFTDEL_ADMIN_EMAIL, SOFTDEL_ADMIN_PASSWORD)
    const { data: del, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softId)
      .select('id')
    if (delErr || !del?.length) throw new Error(`softdel admin: ${delErr?.message ?? '0 rows'}`)

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossAdmin = await createAuthenticatedClient(cross.email, cross.password)
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    instructor = await createAuthenticatedClient(ins.email, ins.password)

    sittingId = await createSittingRpc(egmontAdmin, egmontAdminId)
    track.sittingIds.push(sittingId)
    const { data: added, error: addErr } = await egmontAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [victimId],
    })
    if (addErr) throw new Error(`add candidates: ${addErr.message}`)
    expect(added).toEqual([{ added: 1, skipped_existing: 0, skipped_deactivated: 0 }])
    crossSittingId = await createSittingRpc(crossAdmin, crossAdminId)
    track.sittingIds.push(crossSittingId)
  })

  test.afterAll(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('MI: a cross-org admin cannot read or write an egmont sitting', async () => {
    const before = await sittingState(admin, sittingId)
    expect(before).toMatchObject({ mode: 'remote', status: 'scheduled', candidates: 1 })

    for (const c of sittingCalls(sittingId, victimId)) {
      const { error } = await crossAdmin.rpc(c.fn, c.args)
      expect(error?.message ?? `${c.fn}: no error`, c.fn).toMatch(/sitting_not_found/)
    }
    const inv = await crossAdmin.rpc('create_exam_sitting', {
      p_scheduled_at: new Date().toISOString(),
      p_mode: 'remote',
      p_invigilator_id: egmontAdminId,
    })
    expect(inv.error?.message ?? '').toMatch(/invigilator_not_found/)
    const stu = await crossAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: crossSittingId,
      p_user_ids: [victimId],
    })
    expect(stu.error?.message ?? '').toMatch(/student_not_found/)

    const { data: listed, error: listErr } = await crossAdmin.rpc('list_exam_sittings', {
      p_scope: 'upcoming',
      p_limit: 200,
    })
    expect(listErr).toBeNull()
    const ids = ((listed ?? []) as { id: string }[]).map((r) => r.id)
    expect(ids).toContain(crossSittingId)
    expect(ids).not.toContain(sittingId)

    expect(await sittingState(admin, sittingId)).toEqual(before)

    const { data: summary, error: sumErr } = await egmontAdmin.rpc('get_exam_sitting_summary', {
      p_sitting_id: sittingId,
    })
    expect(sumErr).toBeNull()
    expect(summary).toHaveLength(1)
    expect(summary?.[0]).toMatchObject({ status: 'scheduled', candidates: 1, entries: 0 })
  })

  test('MJ: a student, an instructor and a soft-deleted admin are refused', async () => {
    const before = await sittingState(admin, sittingId)
    const calls: Call[] = [
      ...sittingCalls(sittingId, victimId),
      {
        fn: 'create_exam_sitting',
        args: {
          p_scheduled_at: new Date().toISOString(),
          p_mode: 'remote',
          p_invigilator_id: egmontAdminId,
        },
      },
      { fn: 'list_exam_sittings', args: { p_scope: 'upcoming' } },
    ]
    expect(calls).toHaveLength(15)
    for (const [who, client] of [
      ['student', student],
      ['instructor', instructor],
      ['soft-deleted admin', softDelAdmin],
    ] as const) {
      for (const c of calls) {
        const { error } = await client.rpc(c.fn, c.args)
        expect(error?.message ?? `${who} ${c.fn}: no error`, `${who} ${c.fn}`).toMatch(/not_admin/)
      }
    }
    expect(await sittingState(admin, sittingId)).toEqual(before)

    const { error: ctrlErr } = await egmontAdmin.rpc('get_exam_sitting_summary', {
      p_sitting_id: sittingId,
    })
    expect(ctrlErr).toBeNull()
  })
})
