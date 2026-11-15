/**
 * Red Team Spec: instructor reads student-group content through audit_events (Vector MB, #1776)
 *
 * `student_groups` / `student_group_members` give an instructor no SELECT path, and
 * `student_groups.description` is column-revoked from `authenticated`. The student-group RPCs
 * write the group description and member user_ids into `audit_events.metadata`, which
 * `audit_read_instructors` exposed to every same-org instructor before mig 20261115000400.
 * Should hold: an instructor reads no student_group audit row carrying the description or members.
 * CONTROL: the same-org admin reads the rows.
 *
 * Hermetic: the group carries E2E_REDTEAM_SG_MARKER in `name`; afterAll soft-deletes memberships
 * then the group (per-step accumulator). audit_events rows are append-only, left.
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
  seedRedTeamInstructor,
  seedRedTeamStudent,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const NOTE = `${E2E_REDTEAM_SG_MARKER} admin-only note`

test.describe('Red Team: student-group audit rows and instructors (MB)', () => {
  let admin: Admin
  let studentId: string
  let groupId: string | null = null
  let egmontAdmin: SupabaseClient
  let instructor: SupabaseClient

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamAdmin()
    const stu = await seedRedTeamStudent()
    const inst = await seedRedTeamInstructor()
    studentId = stu.victimUserId
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    instructor = await createAuthenticatedClient(inst.email, inst.password)
    const created = await egmontAdmin.rpc('create_student_group', {
      p_name: `${E2E_REDTEAM_SG_MARKER}-audit-${Date.now()}`,
      p_description: NOTE,
    })
    if (created.error || typeof created.data !== 'string') {
      throw new Error(`create_student_group: ${created.error?.message}`)
    }
    groupId = created.data
    const added = await egmontAdmin.rpc('add_student_group_members', {
      p_group_id: groupId,
      p_user_ids: [studentId],
    })
    if (added.error || added.data !== 1) throw new Error(`add: ${added.error?.message}`)
    const updated = await egmontAdmin.rpc('update_student_group', {
      p_group_id: groupId,
      p_name: `${E2E_REDTEAM_SG_MARKER}-audit-renamed-${Date.now()}`,
    })
    if (updated.error) throw new Error(`update: ${updated.error.message}`)
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

  test('MB: an instructor reads no student-group description or members from audit_events', async () => {
    const tables = await instructor
      .from('student_groups')
      .select('id')
      .eq('id', groupId ?? '')
    expect(tables.error).toBeNull()
    expect(tables.data).toEqual([])

    // CONTROL: the admin reads the three audit rows, carrying the note and the member.
    const ctl = await egmontAdmin
      .from('audit_events')
      .select('event_type, metadata')
      .eq('resource_id', groupId ?? '')
    expect(ctl.error).toBeNull()
    const ctlText = JSON.stringify(ctl.data)
    expect((ctl.data ?? []).length).toBe(3)
    expect(ctlText).toContain(NOTE)
    expect(ctlText).toContain(studentId)

    const res = await instructor
      .from('audit_events')
      .select('event_type, metadata')
      .eq('resource_id', groupId ?? '')
    expect(res.error).toBeNull()
    const text = JSON.stringify(res.data)
    expect(text).not.toContain(NOTE)
    expect(text).not.toContain(studentId)
  })
})
