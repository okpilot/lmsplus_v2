/**
 * Red Team Spec: get_vfr_rt_exam_results RPC (VFR RT mock exam review)
 *
 * SECURITY DEFINER RPC that returns graded results + answer-key reveal for a
 * COMPLETED VFR RT session. The session-ownership SELECT (mig 103/106) is
 * `WHERE id = p_session_id AND student_id = auth.uid() AND mode = 'vfr_rt_exam'
 * AND deleted_at IS NULL AND ended_at IS NOT NULL` — the `ended_at IS NOT NULL`
 * predicate is the answer-key-reveal gate, and a NOT FOUND on any predicate
 * raises the single message 'Session not found, not owned, or not completed'.
 * Vectors (attack-surface.md):
 *  - DR2 (P0)  pre-completion answer-key reveal — the OWNER requests results on
 *              their own not-yet-completed session (ended_at NULL) → rejected,
 *              so answer keys / canonical answers are never revealed mid-exam.
 *  - DR3 (P0)  IDOR — an attacker requests results on a VICTIM's completed
 *              session → rejected by the student_id predicate.
 *
 * DR1 (unauthenticated) is covered in the Hub A server-action-unauthenticated
 * spec. The success / output-contract path (≥2 distinct completed pass/fail
 * fixtures) requires a seeded VFR-RT question pool that does not yet exist in
 * the red-team E2E env — it is covered at the integration layer
 * (rpc-vfr-rt-results.integration.test.ts) and the E2E success-path is
 * deferred (see #825 follow-up).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

test.describe('Red Team: get_vfr_rt_exam_results RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  // Admin-insert a victim-owned vfr_rt session. `completed` sets ended_at + a
  // real score so the row models a graded session (DR3); omitting it leaves
  // ended_at NULL for the pre-completion gate (DR2). The guard SELECT fires
  // before any answer-key read, so no question pool is needed.
  const seedSession = async (
    opts: { completed: boolean } = { completed: false },
  ): Promise<string> => {
    const row: Record<string, unknown> = {
      organization_id: orgId,
      student_id: victimUserId,
      mode: 'vfr_rt_exam',
      config: { question_ids: [] },
      total_questions: 1,
      time_limit_seconds: 1800,
      started_at: new Date(Date.now() - 60_000).toISOString(),
    }
    if (opts.completed) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = 80
      row.passed = true
      row.correct_count = 1
    }
    const { data, error } = await admin.from('quiz_sessions').insert(row).select('id').single()
    if (error || !data) throw new Error(`seed session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[vfr-rt-results] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('DR2: the owner cannot read results before the session is completed (answer-key gate)', async () => {
    const sessionId = await seedSession({ completed: false })

    const { data, error } = await victimClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data ?? null).toBeNull()

    // Non-vacuous (§7): the session genuinely exists and is genuinely in the
    // pre-completion state (ended_at NULL) — the rejection is the ended_at gate,
    // not a missing row.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('id, ended_at')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.ended_at).toBeNull()
  })

  test('DR3: an attacker cannot read results for a victim completed session (IDOR)', async () => {
    const sessionId = await seedSession({ completed: true })

    const { data, error } = await attackerClient.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found, not owned, or not completed/i)
    expect(data ?? null).toBeNull()

    // Non-vacuous (§7): the victim session provably exists AND is completed
    // (ended_at set) — so the attacker's 0-result is the student_id predicate
    // blocking a real, readable-by-its-owner session, not an empty/ungraded row.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('id, ended_at')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.ended_at).not.toBeNull()
  })
})
