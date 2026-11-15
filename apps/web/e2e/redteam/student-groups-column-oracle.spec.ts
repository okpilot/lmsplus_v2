/**
 * Red Team Spec: blind read of revoked student_groups columns via filters (Vector ME, #1776)
 *
 * `description` and `created_by` are column-revoked from `authenticated`. A member student uses
 * them in a PostgREST filter, order or embedded filter to extract the value bit by bit.
 * Should hold: every such request fails 42501 with no rows.
 * CONTROL: the same filter shapes on the granted `name` column return the student's group.
 *
 * Hermetic: the group carries E2E_REDTEAM_SG_MARKER in `name`; afterAll soft-deletes the membership
 * then the group (per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SG_MARKER } from './helpers/seed-markers'
import { seedRedTeamAdmin, seedRedTeamStudent } from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const SECRET = 'Zq7secret'

test.describe('Red Team: student_groups revoked-column filter oracle (ME)', () => {
  let admin: Admin
  let groupId: string | null = null
  let groupName: string
  let adminUserId: string
  let student: SupabaseClient

  test.beforeAll(async () => {
    admin = getAdminClient()
    const adm = await seedRedTeamAdmin()
    adminUserId = adm.adminUserId
    const stu = await seedRedTeamStudent()
    groupName = `${E2E_REDTEAM_SG_MARKER}-oracle-${Date.now()}`
    const { data, error } = await admin
      .from('student_groups')
      .insert({
        organization_id: stu.orgId,
        name: groupName,
        description: `${E2E_REDTEAM_SG_MARKER} ${SECRET}`,
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`student_groups: ${error?.message}`)
    groupId = data.id
    const { error: mErr } = await admin
      .from('student_group_members')
      .insert({ organization_id: stu.orgId, group_id: data.id, user_id: stu.victimUserId })
    if (mErr) throw new Error(`student_group_members: ${mErr.message}`)
    student = await createAuthenticatedClient(stu.email, stu.password)
  })

  test.afterAll(async () => {
    if (groupId === null) return
    const id = groupId
    const errors: string[] = []
    const now = new Date().toISOString()
    try {
      const { data, error } = await admin
        .from('student_group_members')
        .update({ deleted_at: now })
        .eq('group_id', id)
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
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`student_groups: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.log(`[cleanup] student_groups: ${data?.length} row(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      groupId = null
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('ME: a member cannot filter or order student_groups by description or created_by', async () => {
    const id = groupId ?? ''

    // CONTROL: the same shapes on the granted `name` column reach the row.
    const ctlFilter = await student.from('student_groups').select('id').ilike('name', groupName)
    expect(ctlFilter.error).toBeNull()
    expect(ctlFilter.data).toEqual([{ id }])
    const ctlOrder = await student.from('student_groups').select('id').eq('id', id).order('name')
    expect(ctlOrder.error).toBeNull()
    expect(ctlOrder.data).toEqual([{ id }])
    const ctlEmbed = await student
      .from('student_group_members')
      .select('group_id, student_groups!inner(id)')
      .ilike('student_groups.name', groupName)
    expect(ctlEmbed.error).toBeNull()
    expect((ctlEmbed.data ?? []).map((r) => r.group_id)).toEqual([id])

    const probes = [
      student.from('student_groups').select('id').ilike('description', `%${SECRET}%`),
      student.from('student_groups').select('id').not('description', 'is', null),
      student.from('student_groups').select('id').or(`description.ilike.%${SECRET}%,id.is.null`),
      student.from('student_groups').select('id').eq('id', id).order('description'),
      student.from('student_groups').select('id').eq('created_by', adminUserId),
      student
        .from('student_group_members')
        .select('group_id, student_groups!inner(id)')
        .ilike('student_groups.description', `%${SECRET}%`),
    ]
    for (const res of await Promise.all(probes)) {
      expect(res.error?.code).toBe('42501')
      expect(res.data).toBeNull()
    }
  })
})
