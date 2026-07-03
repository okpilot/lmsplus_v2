/**
 * Red Team Spec: complete_overdue_exam_session RPC
 *
 * SECURITY DEFINER RPC that force-completes an exam session whose deadline has
 * passed. Vectors (attack-surface.md):
 *  - AX (HIGH)   IDOR — different student calls with a foreign session_id →
 *                'session not found or not accessible' (ownership + org scope
 *                enforced inside FOR UPDATE).
 *  - AY (HIGH)   non-overdue session → 'session is not overdue' (deadline
 *                invariant: now() > started_at + time_limit + 30s grace).
 *  - AZ (HIGH)   study-mode / quick_quiz session → 'session is not an exam'
 *                (mode guard accepts mock_exam / internal_exam / vfr_rt_exam —
 *                widened by mig 102, #697 A.9).
 *  - BB (LOW)    soft-deleted session → 'session not found or not accessible'
 *                (deleted_at IS NULL filter).
 *  - BC (MEDIUM) concurrent completion on the same overdue session → FOR UPDATE
 *                serialises; the second caller hits the idempotent path. No
 *                double-completion, no corruption.
 *  - positive    owner completes their own overdue exam session (score 0, no
 *                answers) → ended_at set, passed=false.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type CompleteResult = {
  session_id: string
  score_percentage: number
  passed: boolean
  total_questions: number
  answered_count: number
}

test.describe('Red Team: complete_overdue_exam_session RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimUserId: string
  let orgId: string
  let subjectId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
  })

  // Seed a victim-owned session. `mode` defaults to mock_exam; `overdue`
  // backdates started_at past the deadline + 30s grace; `ended` marks it
  // already completed.
  const seedSession = async (
    opts: { mode?: string; overdue?: boolean; ended?: boolean } = {},
  ): Promise<string> => {
    const { mode = 'mock_exam', overdue = false, ended = false } = opts
    const row: Record<string, unknown> = {
      organization_id: orgId,
      student_id: victimUserId,
      mode,
      subject_id: subjectId,
      config: { question_ids: [], pass_mark: 75 },
      total_questions: 1,
      time_limit_seconds: 60,
      started_at: new Date(Date.now() - (overdue ? 120_000 : 5_000)).toISOString(),
    }
    if (ended) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = 0
      row.passed = false
      row.correct_count = 0
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
        console.log(`[complete-overdue] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('AX: a different student cannot complete a foreign overdue session (IDOR)', async () => {
    const sessionId = await seedSession({ overdue: true })

    const { data, error } = await attackerClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found or not accessible/i)
    expect(data).toBeNull()

    // The session must remain active — the attacker did not complete it.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).toBeNull()
  })

  test('AY: the owner cannot complete a session that is not yet overdue', async () => {
    const sessionId = await seedSession({ overdue: false })

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session is not overdue/i)
    expect(data).toBeNull()
  })

  test('AZ: the owner cannot complete a non-exam (quick_quiz) session', async () => {
    const sessionId = await seedSession({ mode: 'quick_quiz', overdue: true })

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session is not an exam/i)
    expect(data).toBeNull()
  })

  test('BB: the owner cannot complete a soft-deleted session', async () => {
    const sessionId = await seedSession({ overdue: true })
    const { error: delErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(delErr).toBeNull()

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found or not accessible/i)
    expect(data).toBeNull()
  })

  test('positive: the owner can complete their own overdue exam session', async () => {
    const sessionId = await seedSession({ overdue: true })

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    const result = data as CompleteResult | null
    expect(result?.session_id).toBe(sessionId)
    expect(result?.passed).toBe(false)
    expect(result?.score_percentage).toEqual(0)
    expect(result?.total_questions).toBe(1)
    expect(result?.answered_count).toBe(0)

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed, score_percentage')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.passed).toBe(false)
    expect(row?.score_percentage).toEqual(0)
  })

  test('positive: the owner can complete an overdue internal_exam session', async () => {
    const sessionId = await seedSession({ mode: 'internal_exam', overdue: true })

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    expect((data as CompleteResult | null)?.session_id).toBe(sessionId)

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.passed).toBe(false)
  })

  test('positive: the owner can complete an overdue vfr_rt_exam session', async () => {
    const sessionId = await seedSession({ mode: 'vfr_rt_exam', overdue: true })

    const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    const result = data as CompleteResult | null
    expect(result?.session_id).toBe(sessionId)
    expect(result?.passed).toBe(false)
    expect(Number(result?.score_percentage)).toEqual(0)
    expect(result?.answered_count).toBe(0)
    expect(result?.total_questions).toBe(1)
    // score/answered_count=0 coincide with the fallback default for an overdue,
    // unanswered session; the graded-nonzero path is covered in rpc-vfr-rt-submit.spec.ts (§7).

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed, score_percentage')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.passed).toBe(false)
    expect(Number(row?.score_percentage)).toEqual(0)
  })

  test('the owner cannot complete once their account is soft-deleted', async () => {
    // Seed the session while the user is still active, then soft-delete the
    // user. The org lookup (deleted_at IS NULL) fails before any session work.
    const sessionId = await seedSession({ overdue: true })
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', victimUserId)
    expect(delErr).toBeNull()

    try {
      const { data, error } = await victimClient.rpc('complete_overdue_exam_session', {
        p_session_id: sessionId,
      })
      expect(error).not.toBeNull()
      expect(error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(data).toBeNull()
    } finally {
      // Restore the shared victim fixture so later runs/tests are unaffected.
      // Log rather than throw — a throw here would mask a try-block assertion
      // failure (noUnsafeFinally).
      const { error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
      if (restoreErr) {
        console.error(`[complete-overdue] restore victim user failed: ${restoreErr.message}`)
      }
    }
  })

  test('BC: concurrent completion on the same overdue session ends it exactly once', async () => {
    const sessionId = await seedSession({ overdue: true })

    const [first, second] = await Promise.all([
      victimClient.rpc('complete_overdue_exam_session', { p_session_id: sessionId }),
      victimClient.rpc('complete_overdue_exam_session', { p_session_id: sessionId }),
    ])

    // FOR UPDATE serialises the two callers; neither errors and both observe
    // the same completed session (one does the work, the other is idempotent).
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect((first.data as CompleteResult | null)?.session_id).toBe(sessionId)
    expect((second.data as CompleteResult | null)?.session_id).toBe(sessionId)

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed, score_percentage')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    expect(row?.passed).toBe(false)
    expect(row?.score_percentage).toEqual(0)
  })
})
