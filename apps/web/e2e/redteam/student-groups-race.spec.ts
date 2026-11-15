/**
 * Red Team Spec: student-group membership races (Vectors MC, MD, #1776)
 *
 * MC: parallel add_student_group_members of one student into one group from two admin sessions.
 * Should hold: exactly one call adds (sum of counts 1), one active row, one members_added audit row,
 * no unique_violation surfaced. CONTROL: after removal, a single add adds again (count 1).
 *
 * MD: delete_student_group racing add_student_group_members on the same group.
 * Should hold: no active membership survives in a deleted group; an add that won the race is
 * listed in the delete audit's user_ids. CONTROL: the same add on a live group leaves one active row.
 *
 * Hermetic: groups carry E2E_REDTEAM_SG_MARKER in `name`; afterAll soft-deletes memberships then
 * groups (per-step accumulator). audit_events rows are append-only, left.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SG_MARKER } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const MD_ROUNDS = 6

test.describe('Red Team: student-group membership races (MC, MD)', () => {
  let admin: Admin
  let orgId: string
  let studentId: string
  let a1: SupabaseClient
  let a2: SupabaseClient
  const groupIds: string[] = []

  async function newGroup(label: string): Promise<string> {
    const { data, error } = await admin
      .from('student_groups')
      .insert({
        organization_id: orgId,
        name: `${E2E_REDTEAM_SG_MARKER}-${label}-${Date.now()}-${groupIds.length}`,
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`student_groups: ${error?.message}`)
    groupIds.push(data.id)
    return data.id
  }

  async function activeMembers(groupId: string): Promise<string[]> {
    const { data, error } = await admin
      .from('student_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .is('deleted_at', null)
    if (error) throw new Error(`members: ${error.message}`)
    return (data ?? []).map((r) => r.user_id)
  }

  async function auditRows(groupId: string, eventType: string) {
    const { data, error } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('resource_id', groupId)
      .eq('event_type', eventType)
    if (error) throw new Error(`audit: ${error.message}`)
    return data ?? []
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    await seedRedTeamAdmin()
    orgId = users.orgId
    studentId = users.attackerUserId
    a1 = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    a2 = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
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
    if (errors.length === 0) {
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
      }
    }
    groupIds.length = 0
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('MC: parallel adds of one student into one group add exactly once', async () => {
    const groupId = await newGroup('mc')
    const args = { p_group_id: groupId, p_user_ids: [studentId] }
    const results = await Promise.all([
      a1.rpc('add_student_group_members', args),
      a2.rpc('add_student_group_members', args),
      a1.rpc('add_student_group_members', args),
      a2.rpc('add_student_group_members', args),
    ])
    for (const r of results) expect(r.error).toBeNull()
    expect(results.reduce((n, r) => n + (r.data as number), 0)).toBe(1)
    expect(await activeMembers(groupId)).toEqual([studentId])
    expect(await auditRows(groupId, 'student_group.members_added')).toHaveLength(1)

    // CONTROL: once removed, a single add adds again.
    const rm = await a1.rpc('remove_student_group_members', args)
    expect(rm.error).toBeNull()
    expect(rm.data).toBe(1)
    const again = await a1.rpc('add_student_group_members', args)
    expect(again.error).toBeNull()
    expect(again.data).toBe(1)
    expect(await activeMembers(groupId)).toEqual([studentId])
  })

  test('MD: an add racing delete_student_group leaves no active member in a deleted group', async () => {
    // CONTROL: the same add on a live group leaves one active row.
    const live = await newGroup('md-live')
    const ctl = await a1.rpc('add_student_group_members', {
      p_group_id: live,
      p_user_ids: [studentId],
    })
    expect(ctl.error).toBeNull()
    expect(ctl.data).toBe(1)
    expect(await activeMembers(live)).toEqual([studentId])

    for (let i = 0; i < MD_ROUNDS; i++) {
      const groupId = await newGroup(`md-${i}`)
      const [add, del] = await Promise.all([
        a1.rpc('add_student_group_members', { p_group_id: groupId, p_user_ids: [studentId] }),
        a2.rpc('delete_student_group', { p_group_id: groupId }),
      ])
      expect(del.error).toBeNull()
      if (add.error) expect(add.error.message).toBe('group_not_found')
      else expect(add.data).toBe(1)

      const { data: g, error: gErr } = await admin
        .from('student_groups')
        .select('deleted_at')
        .eq('id', groupId)
        .single()
      expect(gErr).toBeNull()
      expect(g?.deleted_at).not.toBeNull()
      expect(await activeMembers(groupId)).toEqual([])

      const deleted = await auditRows(groupId, 'student_group.deleted')
      expect(deleted).toHaveLength(1)
      const meta = deleted[0]?.metadata
      expect(meta).toBeTruthy()
      const removedIds = (meta as { user_ids?: unknown }).user_ids
      expect(removedIds).toEqual(add.error ? [] : [studentId])
    }
  })
})
