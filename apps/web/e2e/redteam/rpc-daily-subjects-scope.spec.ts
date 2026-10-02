/**
 * Red Team: get_daily_subjects(p_days) — caller self-scope and active-user gate
 * (mig 20261002000100). SECURITY INVOKER; student_responses carries two permissive SELECT
 * policies (students_read_responses, instructors_read_students), so RLS alone lets an
 * instructor/admin read every same-org student's responses. The body's
 * `sr.student_id = auth.uid()` is the only self-scope.
 *
 * GD — same-org instructor/admin with zero own responses gets no rows (victim has rows).
 * GE — cross-org admin with zero own responses gets no rows.
 * GF — soft-deleted caller holding a live JWT is rejected ('user not found or inactive').
 * Anon EXECUTE: covered by anon-function-execute-denied.spec.ts (Vector FS, OpenAPI-derived).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedVictimResponses } from './helpers/seed-responses'
import {
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamStudent,
} from './helpers/seed-users'

const WINDOW_DAYS = 365

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

async function ownResponseCount(userId: string): Promise<number> {
  const { count, error } = await getAdminClient()
    .from('student_responses')
    .select('id', { head: true, count: 'exact' })
    .eq('student_id', userId)
  if (error) throw new Error(`own response count: ${error.message}`)
  return count ?? 0
}

async function dailySubjects(client: Client) {
  const { data, error } = await client.rpc('get_daily_subjects', { p_days: WINDOW_DAYS })
  expect(error).toBeNull()
  expect(Array.isArray(data)).toBe(true)
  return (data ?? []) as { day: string; subject_id: string }[]
}

// Victim payload contract: every row is (ISO day, uuid subject) and every seeded subject appears.
function expectVictimRows(rows: { day: string; subject_id: string }[], subjectIds: string[]) {
  expect(subjectIds.length).toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(row.subject_id).toMatch(/^[0-9a-f-]{36}$/)
  }
  const returned = new Set(rows.map((r) => r.subject_id))
  for (const id of subjectIds) expect(returned.has(id)).toBe(true)
}

test.describe('Red Team: get_daily_subjects scope', () => {
  let victimUserId: string
  let victimSubjectIds: string[]
  let victimClient: Client

  test.beforeAll(async () => {
    const fixture = await seedVictimResponses()
    victimUserId = fixture.victimUserId
    victimSubjectIds = fixture.subjectIds
    const victim = await seedRedTeamStudent()
    victimClient = await createAuthenticatedClient(victim.email, victim.password)
  })

  test('GD: same-org instructor and admin read none of the victim practised subjects', async () => {
    // Control: the victim's own call returns rows, so an empty result below is isolation.
    const own = await dailySubjects(victimClient)
    expectVictimRows(own, victimSubjectIds)

    const instructor = await seedRedTeamInstructor()
    const orgAdmin = await seedRedTeamAdmin()
    for (const caller of [
      { id: instructor.instructorUserId, email: instructor.email, password: instructor.password },
      { id: orgAdmin.adminUserId, email: orgAdmin.email, password: orgAdmin.password },
    ]) {
      expect(await ownResponseCount(caller.id)).toBe(0)
      const client = await createAuthenticatedClient(caller.email, caller.password)

      // Control: RLS (instructors_read_students) DOES expose the victim's rows to this caller,
      // so the RPC's explicit student_id filter is the only guard under test.
      const { data: direct, error: directErr } = await client
        .from('student_responses')
        .select('id')
        .eq('student_id', victimUserId)
        .limit(1)
      expect(directErr).toBeNull()
      expect((direct ?? []).length).toBe(1)

      expect(await dailySubjects(client)).toHaveLength(0)
    }
  })

  test('GE: cross-org admin reads none of the victim practised subjects', async () => {
    const own = await dailySubjects(victimClient)
    expectVictimRows(own, victimSubjectIds)

    const crossAdmin = await seedCrossOrgAdmin()
    expect(await ownResponseCount(crossAdmin.adminUserId)).toBe(0)
    const client = await createAuthenticatedClient(crossAdmin.email, crossAdmin.password)
    expect(await dailySubjects(client)).toHaveLength(0)
  })

  test.describe('GF: soft-deleted caller', () => {
    let victimSoftDeleted = false

    test.afterEach(async () => {
      if (!victimSoftDeleted) return
      const { data: restored, error: restoreErr } = await getAdminClient()
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) throw new Error(`[GF cleanup] restore victim failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0)
        throw new Error('[GF cleanup] restore victim affected 0 rows')
      victimSoftDeleted = false
    })

    test('GF: a soft-deleted caller holding a live JWT is rejected', async () => {
      // Control: the same client reads rows while active.
      const before = await dailySubjects(victimClient)
      expectVictimRows(before, victimSubjectIds)

      const { data: deleted, error: delErr } = await getAdminClient()
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      expect((deleted ?? []).length).toBe(1)
      victimSoftDeleted = true

      const { data, error } = await victimClient.rpc('get_daily_subjects', {
        p_days: WINDOW_DAYS,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(data).toBeNull()
    })
  })
})
