/**
 * Red Team Spec: submit_vfr_rt_exam_answers RPC (VFR RT mock exam grading)
 *
 * SECURITY DEFINER RPC that grades a VFR RT exam session. The session-ownership
 * SELECT (mig 100) is `WHERE id = p_session_id AND student_id = auth.uid() AND
 * mode = 'vfr_rt_exam' AND deleted_at IS NULL FOR UPDATE` — so a NOT FOUND on
 * ANY of those predicates raises the single message
 * 'session_not_found_or_not_accessible' before the answer payload is inspected.
 * Vectors (attack-surface.md):
 *  - DQ2 (P0)  IDOR — attacker submits with a VICTIM's vfr_rt session_id →
 *              rejected, and the victim's session is NOT graded (ended_at stays
 *              NULL).
 *  - DQ3 (P0)  mode confusion — attacker submits with their OWN mock_exam
 *              session_id; the `mode = 'vfr_rt_exam'` filter rejects it before
 *              any payload validation.
 *
 * DQ1 (unauthenticated) is covered in the Hub A server-action-unauthenticated
 * spec. The success / output-contract path (real grading) requires a seeded
 * VFR-RT question pool that does not yet exist in the red-team E2E env — it is
 * covered at the integration layer (rpc-vfr-rt-submit.integration.test.ts) and
 * the E2E success-path is deferred (see #825 follow-up).
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
} from './helpers/seed-users'

// A throwaway answer payload. The ownership/mode SELECT fires before payload
// validation, so the entries are never inspected — any non-null jsonb array
// reaches the same rejection point.
const DUMMY_ANSWERS = [
  { question_id: '00000000-0000-4000-a000-000000000099', selected_option_id: 'a' },
]

test.describe('Red Team: submit_vfr_rt_exam_answers RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let attackerUserId: string
  let orgId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
  })

  // Single-active-session invariant (#1011): these tests admin-INSERT an active
  // quiz_sessions row for the victim (DQ2) and the attacker (DQ3). A leftover
  // active session for either shared user collides with the global
  // uq_one_active_session_per_student index (23505) on insert. Clear both before
  // each test so the seeded session is the only active one.
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
  })

  // Admin-insert a session row directly — the guard tests never reach the
  // grading path, so no real question pool is needed. `mode` and `studentId`
  // are parameterised so the same helper seeds the victim's vfr_rt session
  // (DQ2) and the attacker's mock_exam session (DQ3).
  const seedSession = async (opts: { studentId: string; mode: string }): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: opts.studentId,
        mode: opts.mode,
        config: { question_ids: [] },
        total_questions: 1,
        time_limit_seconds: 1800,
        started_at: new Date(Date.now() - 5_000).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  // Restore in afterEach, not only beforeEach (hermiticity): a test's mutations
  // must not leak an active session into the NEXT spec. Two isolated steps per
  // code-style §7 — (1) soft-delete the ids this spec seeded, (2) clear any active
  // session still held by the shared attacker/victim students. Step 2 is the
  // belt-and-suspenders that covers a session not tracked in createdSessionIds.
  test.afterEach(async () => {
    const errors: string[] = []

    try {
      if (createdSessionIds.size > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[vfr-rt-submit] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
    }

    for (const email of [ATTACKER_EMAIL, VICTIM_EMAIL]) {
      try {
        await cleanupStudentActiveSessions(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }

    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('DQ2: an attacker cannot submit answers to a victim vfr_rt session (IDOR)', async () => {
    const sessionId = await seedSession({ studentId: victimUserId, mode: 'vfr_rt_exam' })

    const { data, error } = await attackerClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: DUMMY_ANSWERS,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session_not_found_or_not_accessible/i)
    expect(data).toBeNull()

    // Non-vacuous (§7): the session is provably a VICTIM-owned vfr_rt_exam
    // session (student_id + mode) that the attacker's rejected call did NOT
    // grade (ended_at still NULL) — so the block is the student_id predicate
    // refusing a real, gradable-by-its-owner session, not a missing/foreign row.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id, mode')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.student_id).toBe(victimUserId)
    expect(row?.mode).toBe('vfr_rt_exam')
    expect(row?.ended_at).toBeNull()
  })

  test('DQ3: submitting a mock_exam session id is rejected by the vfr_rt mode filter', async () => {
    // The attacker OWNS this session, so it is not an ownership failure — the
    // `mode = 'vfr_rt_exam'` predicate is what rejects a mock_exam session,
    // proving the RPC family is mode-isolated (no cross-mode grading).
    const sessionId = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })

    const { data, error } = await attackerClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: DUMMY_ANSWERS,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session_not_found_or_not_accessible/i)
    expect(data).toBeNull()

    // Non-vacuous: the session is provably the attacker's OWN mock_exam session
    // (student_id + mode) and is untouched (ended_at NULL) — so the rejection is
    // the `mode = 'vfr_rt_exam'` filter, not an ownership failure.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, student_id, mode')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.student_id).toBe(attackerUserId)
    expect(row?.mode).toBe('mock_exam')
    expect(row?.ended_at).toBeNull()
  })
})
