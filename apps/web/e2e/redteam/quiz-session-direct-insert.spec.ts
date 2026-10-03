/**
 * Red Team Spec: quiz_sessions direct INSERT by a student — Vectors GK/GL
 *
 * Attack: `authenticated` holds a table-level INSERT grant on quiz_sessions and the only INSERT
 * policy, `students_insert_sessions`, checks `student_id = auth.uid()` alone. No app path inserts
 * quiz_sessions with a user-scoped client (sessions start through SECURITY DEFINER RPCs).
 *   GK (mass-assignment): a student inserts a COMPLETED internal_exam row with passed = true,
 *       score_percentage = 100 — it surfaces in the admin internal-exam attempts list.
 *   GL (cross-tenant): a student inserts a row under another organization_id — it surfaces to
 *       that org's instructors via `instructors_read_sessions`.
 *
 * Expected: both INSERTs are refused and no row lands.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SI_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: quiz_sessions direct INSERT (Vectors GK/GL)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let orgId: string
  let otherOrgId: string
  let subjectId: string

  const markedRows = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('config->>e2e_marker', E2E_REDTEAM_SI_MARKER)
      .is('deleted_at', null)
    if (error) throw new Error(`markedRows: ${error.message}`)
    return data ?? []
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    orgId = seed.orgId
    otherOrgId = seed.otherOrgId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data, error } = await admin.from('easa_subjects').select('id').order('code').limit(1)
    if (error || !data?.[0]) throw new Error(`beforeAll subject: ${error?.message}`)
    subjectId = data[0].id
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_SI_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[direct-insert] soft-deleted ${data?.length}`)
  })

  test('GK: a student cannot insert a completed, passed internal_exam session', async () => {
    // Control: the attacker client is live and reads its own sessions.
    const own = await attacker.from('quiz_sessions').select('id').eq('student_id', attackerUserId)
    expect(own.error).toBeNull()
    expect(await markedRows()).toEqual([])

    const now = new Date().toISOString()
    const { data, error } = await attacker
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode: 'internal_exam',
        subject_id: subjectId,
        total_questions: 20,
        correct_count: 20,
        score_percentage: 100,
        passed: true,
        started_at: now,
        ended_at: now,
        config: { question_ids: [], e2e_marker: E2E_REDTEAM_SI_MARKER },
      })
      .select('id')
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
    expect(await markedRows()).toEqual([])
  })

  test('GL: a student cannot insert a session into another organization', async () => {
    expect(otherOrgId).not.toBe(orgId)
    expect(await markedRows()).toEqual([])

    const now = new Date().toISOString()
    const { data, error } = await attacker
      .from('quiz_sessions')
      .insert({
        organization_id: otherOrgId,
        student_id: attackerUserId,
        mode: 'mock_exam',
        subject_id: subjectId,
        total_questions: 1,
        passed: true,
        score_percentage: 100,
        ended_at: now,
        config: { question_ids: [], e2e_marker: E2E_REDTEAM_SI_MARKER },
      })
      .select('id')
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
    expect(await markedRows()).toEqual([])
  })
})
