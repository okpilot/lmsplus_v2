/**
 * Red Team Spec: student groups read and write scope (Vectors LZ, MA, #1776)
 *
 * LZ: a student member enumerates peers of their group — direct SELECT and PostgREST embedding in
 * both directions — and reads the admin-only `description`. Expected: own membership row only, the
 * groups they belong to only, 42501 on `description`.
 * CONTROL: the same-org admin (user client) reads both members of the shared group and the
 * group the student is not in.
 *
 * MA: a cross-org admin calls every student-group write RPC against an egmont group, and adds an
 * egmont student to their own group. Expected: `group_not_found` / `student_not_found`, nothing
 * changed (service-role re-read). CONTROL: the same admin removes and re-adds their own org member.
 *
 * Hermetic: groups carry E2E_REDTEAM_SG_MARKER in `name`; afterAll soft-deletes memberships then
 * groups (per-step accumulator). audit_events rows from the MA control are append-only, left.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SG_MARKER } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamStudent,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

async function seedGroup(
  admin: Admin,
  opts: { orgId: string; label: string; members: string[]; description?: string },
  track: string[],
): Promise<string> {
  const { data, error } = await admin
    .from('student_groups')
    .insert({
      organization_id: opts.orgId,
      name: `${E2E_REDTEAM_SG_MARKER}-${opts.label}-${Date.now()}`,
      description: opts.description ?? null,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') throw new Error(`student_groups: ${error?.message}`)
  track.push(data.id)
  const { error: mErr } = await admin.from('student_group_members').insert(
    opts.members.map((user_id) => ({
      organization_id: opts.orgId,
      group_id: data.id,
      user_id,
    })),
  )
  if (mErr) throw new Error(`student_group_members: ${mErr.message}`)
  return data.id
}

async function activeMembers(admin: Admin, groupId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('student_group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
  if (error) throw new Error(`members: ${error.message}`)
  return (data ?? []).map((r) => r.user_id).sort()
}

test.describe('Red Team: student groups scope (LZ, MA)', () => {
  let admin: Admin
  let studentId: string
  let peerId: string
  let crossUserId: string
  let sharedId: string
  let peerOnlyId: string
  let otherOrgGroupId: string
  let sharedName: string
  let student: SupabaseClient
  let egmontAdmin: SupabaseClient
  let crossAdmin: SupabaseClient
  const groupIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    const stu = await seedRedTeamStudent()
    await seedRedTeamAdmin()
    const cross = await seedCrossOrgAdmin()
    const crossUser = await createCrossOrgUser()
    studentId = stu.victimUserId
    peerId = users.attackerUserId
    crossUserId = crossUser.userId
    sharedId = await seedGroup(
      admin,
      {
        orgId: users.orgId,
        label: 'shared',
        members: [studentId, peerId],
        description: `${E2E_REDTEAM_SG_MARKER} admin note`,
      },
      groupIds,
    )
    peerOnlyId = await seedGroup(
      admin,
      { orgId: users.orgId, label: 'peer', members: [peerId] },
      groupIds,
    )
    otherOrgGroupId = await seedGroup(
      admin,
      { orgId: cross.orgId, label: 'other', members: [crossUserId] },
      groupIds,
    )
    const { data: g, error: gErr } = await admin
      .from('student_groups')
      .select('name')
      .eq('id', sharedId)
      .single()
    if (gErr || typeof g?.name !== 'string') throw new Error(`name: ${gErr?.message}`)
    sharedName = g.name
    student = await createAuthenticatedClient(stu.email, stu.password)
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossAdmin = await createAuthenticatedClient(cross.email, cross.password)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { data, error } = await admin
        .from('student_group_members')
        .update({ deleted_at: now })
        .in('group_id', groupIds)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`student_group_members: ${error.message}`)
      if ((data?.length ?? 0) > 0)
        console.log(`[cleanup] student_group_members: ${data?.length} row(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('student_groups')
        .update({ deleted_at: now })
        .in('id', groupIds)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`student_groups: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.log(`[cleanup] student_groups: ${data?.length} row(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      groupIds.length = 0
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('LZ: a student member reads only their own membership and their own groups', async () => {
    const ids = [sharedId, peerOnlyId, otherOrgGroupId]

    // CONTROL: the same-org admin sees the peer rows the student must not.
    const ctlMembers = await egmontAdmin
      .from('student_group_members')
      .select('group_id, user_id')
      .in('group_id', ids)
    expect(ctlMembers.error).toBeNull()
    expect((ctlMembers.data ?? []).filter((r) => r.group_id === sharedId)).toHaveLength(2)
    expect((ctlMembers.data ?? []).some((r) => r.group_id === peerOnlyId)).toBe(true)
    const ctlGroups = await egmontAdmin.from('student_groups').select('id').in('id', ids)
    expect(ctlGroups.error).toBeNull()
    expect((ctlGroups.data ?? []).map((r) => r.id).sort()).toEqual([sharedId, peerOnlyId].sort())

    const members = await student
      .from('student_group_members')
      .select('group_id, user_id')
      .in('group_id', ids)
    expect(members.error).toBeNull()
    expect(members.data).toEqual([{ group_id: sharedId, user_id: studentId }])

    const groups = await student.from('student_groups').select('id, name').in('id', ids)
    expect(groups.error).toBeNull()
    expect(groups.data).toEqual([{ id: sharedId, name: sharedName }])

    const embedDown = await student
      .from('student_groups')
      .select('id, student_group_members(user_id)')
      .eq('id', sharedId)
    expect(embedDown.error).toBeNull()
    expect(embedDown.data).toEqual([
      { id: sharedId, student_group_members: [{ user_id: studentId }] },
    ])

    const embedUp = await student
      .from('student_group_members')
      .select('user_id, student_groups(id, name)')
      .eq('group_id', sharedId)
    expect(embedUp.error).toBeNull()
    expect(embedUp.data).toEqual([
      { user_id: studentId, student_groups: { id: sharedId, name: sharedName } },
    ])

    const desc = await student.from('student_groups').select('description').eq('id', sharedId)
    expect(desc.error?.code).toBe('42501')
    expect(desc.data).toBeNull()
    const descEmbed = await student
      .from('student_group_members')
      .select('user_id, student_groups(description)')
      .eq('group_id', sharedId)
    expect(descEmbed.error?.code).toBe('42501')
    expect(descEmbed.data).toBeNull()
  })

  test('MA: a cross-org admin cannot read or write another org group or member', async () => {
    const before = await activeMembers(admin, sharedId)
    expect(before).toEqual([studentId, peerId].sort())

    // CONTROL: the cross-org admin reads and writes their own org group.
    const own = await crossAdmin.from('student_groups').select('id').eq('id', otherOrgGroupId)
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ id: otherOrgGroupId }])
    const rm = await crossAdmin.rpc('remove_student_group_members', {
      p_group_id: otherOrgGroupId,
      p_user_ids: [crossUserId],
    })
    expect(rm.error).toBeNull()
    expect(rm.data).toBe(1)
    const add = await crossAdmin.rpc('add_student_group_members', {
      p_group_id: otherOrgGroupId,
      p_user_ids: [crossUserId],
    })
    expect(add.error).toBeNull()
    expect(add.data).toBe(1)

    const read = await crossAdmin.from('student_groups').select('id').eq('id', sharedId)
    expect(read.error).toBeNull()
    expect(read.data).toEqual([])
    const readM = await crossAdmin
      .from('student_group_members')
      .select('user_id')
      .eq('group_id', sharedId)
    expect(readM.error).toBeNull()
    expect(readM.data).toEqual([])

    const attempts = [
      crossAdmin.rpc('add_student_group_members', {
        p_group_id: sharedId,
        p_user_ids: [crossUserId],
      }),
      crossAdmin.rpc('remove_student_group_members', {
        p_group_id: sharedId,
        p_user_ids: [studentId],
      }),
      crossAdmin.rpc('update_student_group', { p_group_id: sharedId, p_name: 'hijacked' }),
      crossAdmin.rpc('delete_student_group', { p_group_id: sharedId }),
    ]
    for (const res of await Promise.all(attempts)) {
      expect(res.error?.message).toBe('group_not_found')
      expect(res.data).toBeNull()
    }
    const pull = await crossAdmin.rpc('add_student_group_members', {
      p_group_id: otherOrgGroupId,
      p_user_ids: [studentId],
    })
    expect(pull.error?.message).toBe('student_not_found')

    expect(await activeMembers(admin, sharedId)).toEqual(before)
    expect(await activeMembers(admin, otherOrgGroupId)).toEqual([crossUserId])
    const { data: g, error: gErr } = await admin
      .from('student_groups')
      .select('name, deleted_at')
      .eq('id', sharedId)
      .single()
    expect(gErr).toBeNull()
    expect(g).toEqual({ name: sharedName, deleted_at: null })
  })
})
