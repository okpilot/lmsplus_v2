/**
 * Red Team: get_session_reports — active-user gate and output contract after DROP + CREATE.
 *
 * Vector IH (HIGH): mig 20261017000500 re-creates get_session_reports via DROP + CREATE to add
 * subject_code. A DROP + CREATE replaces the whole body; this spec pins the active-user gate
 * (mig 20260623000100, #883). Anon denial is CL1, cross-user scoping is CL3.
 *
 * Control arm: while active, the owner reads their seeded sessions with the documented
 * subject fields (2 distinct subjects + the NULL LEFT JOIN path) and score fields. After a service-role
 * soft-delete, the same still-valid JWT is rejected with 'user not found or inactive'.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_IH_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

type ReportRow = {
  id: string
  subject_id: string | null
  subject_name: string | null
  subject_code: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | string | null
  total_count: number | string
}

test.describe('Red Team: get_session_reports active-user gate (Vector IH)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let subjects: Array<{ id: string; code: string; name: string }>
  const tracker = createFixtureTracker()
  let victimSoftDeleted = false

  test.beforeAll(async () => {
    const seeded = await seedRedTeamUsers()
    victimUserId = seeded.victimUserId
    orgId = seeded.orgId
    admin = getAdminClient()
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('easa_subjects')
      .select('id, code, name')
      .order('code')
      .limit(2)
    if (error) throw new Error(`IH subjects: ${error.message}`)
    subjects = data ?? []
    expect(subjects).toHaveLength(2)
    expect(subjects[0]?.code).not.toBe(subjects[1]?.code)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    if (victimSoftDeleted) {
      try {
        const { data, error } = await admin
          .from('users')
          .update({ deleted_at: null })
          .eq('id', victimUserId)
          .select('id')
        if (error) throw new Error(`restore victim: ${error.message}`)
        if ((data?.length ?? 0) === 0) throw new Error('restore victim affected 0 rows')
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        victimSoftDeleted = false
      }
    }
    try {
      await cleanupFixtures(admin, tracker)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function seedCompletedSession(subjectId: string | null, minutesAgo: number) {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        subject_id: subjectId,
        config: { question_ids: [], pass_mark: 75, e2e_marker: E2E_REDTEAM_IH_MARKER },
        total_questions: 1,
        started_at: new Date(Date.now() - (minutesAgo + 5) * 60_000).toISOString(),
        ended_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        score_percentage: 100,
        passed: true,
        correct_count: 1,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`IH seed session: ${error?.message}`)
    tracker.sessions.add(data.id)
    return data.id
  }

  test('owner reads subject_code for own sessions until soft-deleted, then the RPC rejects', async () => {
    const [a, b] = subjects
    if (!a || !b) throw new Error('IH: two subjects required')
    const idA = await seedCompletedSession(a.id, 1)
    const idB = await seedCompletedSession(b.id, 2)
    const idNull = await seedCompletedSession(null, 3)

    const before = await victimClient.rpc('get_session_reports', { p_limit: 100 })
    expect(before.error).toBeNull()
    expect(Array.isArray(before.data)).toBe(true)
    const rows = (before.data ?? []) as ReportRow[]
    expect(Number(rows[0]?.total_count ?? 0)).toBeGreaterThanOrEqual(3)

    const rowA = rows.find((r) => r.id === idA)
    const rowB = rows.find((r) => r.id === idB)
    const rowNull = rows.find((r) => r.id === idNull)
    expect(rowA).toMatchObject({ subject_id: a.id, subject_code: a.code, subject_name: a.name })
    expect(rowB).toMatchObject({ subject_id: b.id, subject_code: b.code, subject_name: b.name })
    expect(rowNull).toMatchObject({ subject_id: null, subject_code: null, subject_name: null })
    for (const row of [rowA, rowB, rowNull]) {
      expect(row).toMatchObject({ total_questions: 1, correct_count: 1 })
      expect(Number(row?.score_percentage)).toBe(100)
    }

    const { data: deleted, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', victimUserId)
      .is('deleted_at', null)
      .select('id')
    victimSoftDeleted = true
    expect(delErr).toBeNull()
    expect((deleted ?? []).length).toBeGreaterThan(0)

    const after = await victimClient.rpc('get_session_reports', { p_limit: 100 })
    expect(after.error).not.toBeNull()
    expect(after.error?.message ?? '').toMatch(/user not found or inactive/i)
    expect(after.data).toBeNull()
  })
})
