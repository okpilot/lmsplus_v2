/**
 * Red Team Spec: get_student_groups_with_counts scope and count integrity (Vectors MF, MG, #1776)
 *
 * MF: a student, an instructor, a soft-deleted admin holding a live JWT, and a cross-org admin call
 * the RPC. Expected: `not_admin` for the first three; the cross-org admin's rows hold none of the
 * egmont group ids. CONTROL: the egmont admin's rows hold the egmont group; the cross-org admin's
 * rows hold their own group.
 *
 * MG: forged service-role memberships try to inflate the counts — a cross-org student, an
 * instructor, a soft-deleted membership — and a soft-deleted group tries to reappear. Expected:
 * active 1, deactivated 1 (the deactivated student), soft-deleted group absent.
 * CONTROL: the live student and the deactivated student are each counted.
 *
 * Hermetic: groups carry E2E_REDTEAM_SG_MARKER in `name`; afterAll soft-deletes memberships then
 * groups (per-step accumulator). Throwaway users stay soft-deleted.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { E2E_REDTEAM_SG_MARKER } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamStudent,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>
type Row = { id: string; active_count: number; deactivated_count: number }

const DEACTIVATED_EMAIL = 'redteam-sgc-deactivated@lmsplus.local'
const DEACTIVATED_PASSWORD = 'redteam-sgc-deactivated-2026!'
const SOFTDEL_ADMIN_EMAIL = 'redteam-sgc-softdel-admin@lmsplus.local'
const SOFTDEL_ADMIN_PASSWORD = 'redteam-sgc-softdel-admin-2026!'

async function setDeleted(admin: Admin, userId: string, deleted: boolean): Promise<void> {
  const { data, error } = await admin
    .from('users')
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', userId)
    .select('id')
  if (error || !data?.length) throw new Error(`users ${userId}: ${error?.message ?? '0 rows'}`)
}

async function seedGroup(
  admin: Admin,
  opts: { orgId: string; label: string; deleted?: boolean },
  track: string[],
): Promise<string> {
  const { data, error } = await admin
    .from('student_groups')
    .insert({
      organization_id: opts.orgId,
      name: `${E2E_REDTEAM_SG_MARKER}-sgc-${opts.label}-${Date.now()}`,
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') throw new Error(`student_groups: ${error?.message}`)
  track.push(data.id)
  return data.id
}

async function addMembers(
  admin: Admin,
  rows: { orgId: string; groupId: string; userId: string; deleted?: boolean }[],
): Promise<void> {
  const { error } = await admin.from('student_group_members').insert(
    rows.map((r) => ({
      organization_id: r.orgId,
      group_id: r.groupId,
      user_id: r.userId,
      deleted_at: r.deleted ? new Date().toISOString() : null,
    })),
  )
  if (error) throw new Error(`student_group_members: ${error.message}`)
}

async function rows(client: SupabaseClient): Promise<Row[]> {
  const { data, error } = await client.rpc('get_student_groups_with_counts')
  if (error) throw new Error(`rpc: ${error.message}`)
  return (data ?? []) as Row[]
}

test.describe('Red Team: get_student_groups_with_counts (MF, MG)', () => {
  let admin: Admin
  let groupId: string
  let deletedGroupId: string
  let otherOrgGroupId: string
  let egmontAdmin: SupabaseClient
  let crossAdmin: SupabaseClient
  let student: SupabaseClient
  let instructor: SupabaseClient
  let softDelAdmin: SupabaseClient
  let softDelAdminId: string
  const groupIds: string[] = []

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    const stu = await seedRedTeamStudent()
    await seedRedTeamAdmin()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    const crossUser = await createCrossOrgUser()
    const orgId = users.orgId

    const deactivatedId = await upsertUser(admin, DEACTIVATED_EMAIL, DEACTIVATED_PASSWORD, orgId)
    await setDeleted(admin, deactivatedId, true)

    softDelAdminId = await upsertUser(
      admin,
      SOFTDEL_ADMIN_EMAIL,
      SOFTDEL_ADMIN_PASSWORD,
      orgId,
      'admin',
    )
    await setDeleted(admin, softDelAdminId, false)
    softDelAdmin = await createAuthenticatedClient(SOFTDEL_ADMIN_EMAIL, SOFTDEL_ADMIN_PASSWORD)

    groupId = await seedGroup(admin, { orgId, label: 'counts' }, groupIds)
    deletedGroupId = await seedGroup(admin, { orgId, label: 'deleted', deleted: true }, groupIds)
    otherOrgGroupId = await seedGroup(admin, { orgId: cross.orgId, label: 'other' }, groupIds)
    await addMembers(admin, [
      { orgId, groupId, userId: stu.victimUserId },
      { orgId, groupId, userId: deactivatedId },
      { orgId, groupId, userId: crossUser.userId },
      { orgId, groupId, userId: ins.instructorUserId },
      { orgId, groupId, userId: users.attackerUserId, deleted: true },
      { orgId, groupId: deletedGroupId, userId: stu.victimUserId },
      { orgId: cross.orgId, groupId: otherOrgGroupId, userId: crossUser.userId },
    ])

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossAdmin = await createAuthenticatedClient(cross.email, cross.password)
    student = await createAuthenticatedClient(stu.email, stu.password)
    instructor = await createAuthenticatedClient(ins.email, ins.password)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { error } = await admin
        .from('student_group_members')
        .update({ deleted_at: now })
        .in('group_id', groupIds)
        .is('deleted_at', null)
      if (error) throw new Error(`student_group_members: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { error } = await admin
        .from('student_groups')
        .update({ deleted_at: now })
        .in('id', groupIds)
        .is('deleted_at', null)
      if (error) throw new Error(`student_groups: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (softDelAdminId) await setDeleted(admin, softDelAdminId, true)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      groupIds.length = 0
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('MF: only a live same-org admin reads the org groups', async () => {
    // CONTROL: the live admins each see their own org group; the throwaway admin passes the gate.
    expect((await rows(egmontAdmin)).map((r) => r.id)).toContain(groupId)
    const crossIds = (await rows(crossAdmin)).map((r) => r.id)
    expect(crossIds).toContain(otherOrgGroupId)
    expect((await rows(softDelAdmin)).map((r) => r.id)).toContain(groupId)

    expect(crossIds).not.toContain(groupId)
    expect(crossIds).not.toContain(deletedGroupId)

    await setDeleted(admin, softDelAdminId, true)
    for (const client of [student, instructor, softDelAdmin]) {
      const res = await client.rpc('get_student_groups_with_counts')
      expect(res.error?.message).toBe('not_admin')
      expect(res.data).toBeNull()
    }
  })

  test('MG: forged memberships and a soft-deleted group do not reach the counts', async () => {
    const all = await rows(egmontAdmin)
    expect(all.map((r) => r.id)).not.toContain(deletedGroupId)
    const row = all.find((r) => r.id === groupId)
    expect(row).toMatchObject({ active_count: 1, deactivated_count: 1 })
  })
})
