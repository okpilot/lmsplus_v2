/**
 * Red Team Spec: foreign ids injected into an admin's OWN sitting (Vector ND, #1777)
 *
 * ND: the cross-org admin calls the Add people / Add exams / Issue codes popup RPCs on their own
 * sitting with egmont ids: add_exam_sitting_candidates and get_exam_sitting_group_add_counts with an
 * egmont group, list_exam_sitting_people filtered by an egmont group, and
 * get_exam_sitting_subject_eligibility / get_exam_sitting_same_day_people /
 * get_exam_sitting_issue_preview with an egmont student. Expected: `group_not_found` /
 * `invalid_input`, zero rows, no egmont user id in any result, no candidate row written.
 * CONTROL: the same calls with the cross-org admin's own group and own student succeed and return
 * that student.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; groups carry E2E_REDTEAM_SG_MARKER. afterAll
 * soft-deletes memberships, groups, then the sitting fixtures (per-step accumulator).
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
import { E2E_REDTEAM_SG_MARKER } from './helpers/seed-markers'
import {
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamStudent,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

async function seedGroup(
  admin: Admin,
  opts: { orgId: string; label: string; members: string[] },
  track: string[],
): Promise<string> {
  const { data, error } = await admin
    .from('student_groups')
    .insert({
      organization_id: opts.orgId,
      name: `${E2E_REDTEAM_SG_MARKER}-ND-${opts.label}-${Date.now()}`,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') throw new Error(`student_groups: ${error?.message}`)
  track.push(data.id)
  const { error: mErr } = await admin
    .from('student_group_members')
    .insert(
      opts.members.map((user_id) => ({ organization_id: opts.orgId, group_id: data.id, user_id })),
    )
  if (mErr) throw new Error(`student_group_members: ${mErr.message}`)
  return data.id
}

async function liveCandidates(admin: Admin, sittingId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('exam_sitting_candidates')
    .select('user_id')
    .eq('sitting_id', sittingId)
    .is('deleted_at', null)
  if (error) throw new Error(`candidates: ${error.message}`)
  return (data ?? []).map((r) => r.user_id).sort()
}

function userIdsOf(rows: unknown): string[] {
  return ((rows ?? []) as { user_id?: string }[]).map((r) => r.user_id ?? '')
}

test.describe('Red Team: foreign ids in own sitting (ND)', () => {
  let admin: Admin
  let crossAdmin: SupabaseClient
  let victimId: string
  let crossUserId: string
  let egmontGroupId: string
  let ownGroupId: string
  let sittingId: string
  const groupIds: string[] = []
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    const v = await seedRedTeamStudent()
    const cross = await seedCrossOrgAdmin()
    const crossUser = await createCrossOrgUser()
    victimId = v.victimUserId
    crossUserId = crossUser.userId
    track.adminId = cross.adminUserId
    egmontGroupId = await seedGroup(
      admin,
      { orgId: a.orgId, label: 'egmont', members: [victimId] },
      groupIds,
    )
    ownGroupId = await seedGroup(
      admin,
      { orgId: cross.orgId, label: 'own', members: [crossUserId] },
      groupIds,
    )
    crossAdmin = await createAuthenticatedClient(cross.email, cross.password)
    sittingId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(sittingId)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
      [
        'student_group_members',
        () =>
          admin
            .from('student_group_members')
            .update({ deleted_at: now })
            .in('group_id', groupIds)
            .is('deleted_at', null),
      ],
      [
        'student_groups',
        () =>
          admin
            .from('student_groups')
            .update({ deleted_at: now })
            .in('id', groupIds)
            .is('deleted_at', null),
      ],
    ]
    for (const [label, run] of steps) {
      try {
        const { error } = await run()
        if (error) throw new Error(`${label}: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`ND cleanup: ${errors.join('; ')}`)
  })

  test('ND: egmont group and student ids are refused or dropped in the attacker own sitting', async () => {
    const counts = await crossAdmin.rpc('get_exam_sitting_group_add_counts', {
      p_sitting_id: sittingId,
      p_group_id: egmontGroupId,
    })
    expect(counts.error?.message ?? 'no error').toMatch(/group_not_found/)

    const people = await crossAdmin.rpc('list_exam_sitting_people', {
      p_sitting_id: sittingId,
      p_group_id: egmontGroupId,
      p_limit: 200,
    })
    expect(people.error).toBeNull()
    expect(people.data ?? []).toHaveLength(0)

    const all = await crossAdmin.rpc('list_exam_sitting_people', {
      p_sitting_id: sittingId,
      p_limit: 200,
    })
    expect(all.error).toBeNull()
    expect(userIdsOf(all.data)).not.toContain(victimId)

    const addGroup = await crossAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_group_ids: [egmontGroupId],
    })
    expect(addGroup.error?.message ?? 'no error').toMatch(/group_not_found/)
    expect(await liveCandidates(admin, sittingId)).toEqual([])

    // CONTROL: own group counts, lists and adds the own student.
    const ownCounts = await crossAdmin.rpc('get_exam_sitting_group_add_counts', {
      p_sitting_id: sittingId,
      p_group_id: ownGroupId,
    })
    expect(ownCounts.error).toBeNull()
    expect(ownCounts.data).toEqual([{ active_new: 1, deactivated_new: 0 }])
    const ownPeople = await crossAdmin.rpc('list_exam_sitting_people', {
      p_sitting_id: sittingId,
      p_group_id: ownGroupId,
      p_limit: 200,
    })
    expect(ownPeople.error).toBeNull()
    expect(userIdsOf(ownPeople.data)).toEqual([crossUserId])
    const ownAdd = await crossAdmin.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_group_ids: [ownGroupId],
    })
    expect(ownAdd.error).toBeNull()
    expect(ownAdd.data).toEqual([{ added: 1, skipped_existing: 0, skipped_deactivated: 0 }])
    expect(await liveCandidates(admin, sittingId)).toEqual([crossUserId])

    for (const fn of [
      'get_exam_sitting_subject_eligibility',
      'get_exam_sitting_same_day_people',
      'get_exam_sitting_issue_preview',
    ]) {
      const foreign = await crossAdmin.rpc(fn, { p_sitting_id: sittingId, p_user_ids: [victimId] })
      expect(foreign.error?.message ?? `${fn}: no error`, fn).toMatch(/invalid_input/)
      const mixed = await crossAdmin.rpc(fn, {
        p_sitting_id: sittingId,
        p_user_ids: [victimId, crossUserId],
      })
      expect(mixed.error, fn).toBeNull()
      expect(JSON.stringify(mixed.data ?? []), fn).not.toContain(victimId)
      // CONTROL: the own candidate alone resolves.
      const own = await crossAdmin.rpc(fn, { p_sitting_id: sittingId, p_user_ids: [crossUserId] })
      expect(own.error, fn).toBeNull()
    }
    expect(await liveCandidates(admin, sittingId)).toEqual([crossUserId])
  })
})
