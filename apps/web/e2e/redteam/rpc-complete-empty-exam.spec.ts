/**
 * Red Team Spec: complete_empty_exam_session RPC
 *
 * SECURITY DEFINER RPC that completes an exam session with zero answers (timer
 * expired or student submitted nothing). Sibling of complete_overdue_exam_session
 * but it ALSO accepts not-yet-overdue sessions (routes to exam.completed instead
 * of exam.expired). Vectors (attack-surface.md):
 *  - AO (HIGH)   IDOR — different student calls with a foreign session_id →
 *                'session not found or not accessible'.
 *  - AP (HIGH)   study-mode / quick_quiz session → 'session is not an exam'.
 *  - AQ (MED)    idempotent replay — an already-ended session with a real score
 *                must return that real score (re-read from DB), NOT clobber it
 *                to 0/false.
 *  - AR (LOW)    soft-deleted session → 'session not found or not accessible'.
 *  - positive    owner completes their own empty exam session (mock_exam +
 *                internal_exam, overdue + early-submit), all scoring 0 / false.
 *
 * AN (unauthenticated) is covered in the Hub A server-action-unauthenticated spec.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

type CompleteResult = {
  session_id: string
  score_percentage: number
  passed: boolean
  total_questions: number
  answered_count: number
}

test.describe('Red Team: complete_empty_exam_session RPC', () => {
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

  // Seed a victim-owned session. `overdue` (default true) backdates started_at
  // past the deadline + 30s grace; `endedWithScore` marks it already completed
  // with a real (non-zero) score for the idempotent-path test.
  const seedSession = async (
    opts: {
      mode?: string
      overdue?: boolean
      endedWithScore?: { score: number; passed: boolean; correct: number }
    } = {},
  ): Promise<string> => {
    const { mode = 'mock_exam', overdue = true, endedWithScore } = opts
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
    if (endedWithScore) {
      row.ended_at = new Date().toISOString()
      row.score_percentage = endedWithScore.score
      row.passed = endedWithScore.passed
      row.correct_count = endedWithScore.correct
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
        console.log(`[complete-empty] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('AO: a different student cannot complete a foreign session (IDOR)', async () => {
    const sessionId = await seedSession()

    const { data, error } = await attackerClient.rpc('complete_empty_exam_session', {
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

  test('AP: the owner cannot complete a non-exam (quick_quiz) session', async () => {
    const sessionId = await seedSession({ mode: 'quick_quiz' })

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session is not an exam/i)
    expect(data).toBeNull()
  })

  test('AR: the owner cannot complete a soft-deleted session', async () => {
    const sessionId = await seedSession()
    // Soft-deleted here by the test itself — the afterEach `.is('deleted_at',
    // null)` filter then no-ops on this row, which is expected.
    const { error: delErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(delErr).toBeNull()

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found or not accessible/i)
    expect(data).toBeNull()
  })

  test('AQ: idempotent replay returns the real stored score, never clobbers it to 0', async () => {
    // An already-ended session carrying a genuine pass. complete_empty must
    // re-read and return 75/true, and must NOT overwrite the row with 0/false.
    const sessionId = await seedSession({
      endedWithScore: { score: 75, passed: true, correct: 3 },
    })

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    const result = data as CompleteResult | null
    expect(result?.session_id).toBe(sessionId)
    expect(result?.score_percentage).toEqual(75)
    expect(result?.passed).toBe(true)

    // The stored row must be untouched by the idempotent path.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('score_percentage, passed')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.score_percentage).toEqual(75)
    expect(row?.passed).toBe(true)
  })

  test('AQ: idempotent replay returns a sub-pass score unchanged (not a hardcoded value)', async () => {
    // Pairs with the 75/true case above: a below-pass-mark score proves the
    // idempotent path re-reads from the DB rather than returning any single
    // hardcoded constant.
    const sessionId = await seedSession({
      endedWithScore: { score: 50, passed: false, correct: 2 },
    })

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    const result = data as CompleteResult | null
    expect(result?.score_percentage).toEqual(50)
    expect(result?.passed).toBe(false)

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('score_percentage, passed')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.score_percentage).toEqual(50)
    expect(row?.passed).toBe(false)
  })

  test('AO+AQ: a different student cannot replay a foreign already-completed session', async () => {
    // The ownership predicate in the FOR UPDATE fires before the idempotent
    // branch, so a non-owner gets IDOR even on an already-ended session — and
    // the victim's stored score stays untouched.
    const sessionId = await seedSession({
      endedWithScore: { score: 75, passed: true, correct: 3 },
    })

    const { data, error } = await attackerClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session not found or not accessible/i)
    expect(data).toBeNull()

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('score_percentage, passed')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.score_percentage).toEqual(75)
    expect(row?.passed).toBe(true)
  })

  test('positive: the owner can complete their own overdue empty exam session', async () => {
    const sessionId = await seedSession()

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    const result = data as CompleteResult | null
    expect(result?.session_id).toBe(sessionId)
    expect(result?.passed).toBe(false)
    expect(result?.score_percentage).toEqual(0)
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

  test('positive: the owner can complete an empty internal_exam session', async () => {
    const sessionId = await seedSession({ mode: 'internal_exam' })

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
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

  test('positive: the owner can complete an empty session before the deadline (early submit)', async () => {
    // Unlike complete_overdue, complete_empty accepts a not-yet-overdue session
    // (student pressed submit with no answers before the timer expired).
    const sessionId = await seedSession({ overdue: false })

    const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
      p_session_id: sessionId,
    })

    expect(error).toBeNull()
    expect((data as CompleteResult | null)?.score_percentage).toEqual(0)

    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('ended_at')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
  })

  test('the owner cannot complete once their account is soft-deleted', async () => {
    // The guard is DB-layer (`users.deleted_at IS NULL` inside the SECURITY
    // DEFINER body), not JWT-layer — a still-valid JWT for a soft-deleted user
    // is rejected by the RPC body, not by GoTrue.
    const sessionId = await seedSession()
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', victimUserId)
    expect(delErr).toBeNull()

    try {
      const { data, error } = await victimClient.rpc('complete_empty_exam_session', {
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
        console.error(`[complete-empty] restore victim user failed: ${restoreErr.message}`)
      }
    }
  })
})
