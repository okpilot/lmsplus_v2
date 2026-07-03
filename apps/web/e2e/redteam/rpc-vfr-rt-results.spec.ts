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
 * fixtures) is covered both at the integration layer
 * (rpc-vfr-rt-results.integration.test.ts) and, via the seed-vfr-rt-pool helper,
 * in the success describe block below (#873).
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'
import {
  buildVfrRtAnswers,
  cleanupVfrRtPool,
  seedVfrRtPool,
  VFR_RT_MC_CORRECT,
  type VfrRtPool,
} from './helpers/seed-vfr-rt-pool'

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

  // Single-active-session invariant (#1011): DR2 admin-INSERTs an active
  // (ended_at NULL) victim-owned quiz_sessions row. A leftover active session
  // for the victim collides with the global uq_one_active_session_per_student
  // index (23505) on insert. Clear it before each test.
  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
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

    // Non-vacuous (§7): the session is provably a VICTIM-owned vfr_rt_exam
    // session (student_id + mode) genuinely in the pre-completion state
    // (ended_at NULL) — so the rejection is the ended_at answer-key gate, not a
    // missing/foreign/wrong-mode row.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('id, ended_at, student_id, mode')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.student_id).toBe(victimUserId)
    expect(row?.mode).toBe('vfr_rt_exam')
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

    // Non-vacuous (§7): the session is provably a VICTIM-owned vfr_rt_exam
    // session (student_id + mode) that is genuinely completed (ended_at set) —
    // so the attacker's 0-result is the student_id predicate blocking a real,
    // readable-by-its-owner session, not an empty/ungraded/foreign row.
    const { data: row, error: readErr } = await admin
      .from('quiz_sessions')
      .select('id, ended_at, student_id, mode')
      .eq('id', sessionId)
      .single()
    expect(readErr).toBeNull()
    expect(row).not.toBeNull()
    expect(row?.student_id).toBe(victimUserId)
    expect(row?.mode).toBe('vfr_rt_exam')
    expect(row?.ended_at).not.toBeNull()
  })
})

// ─── Success / output-contract path (CY, #825/#873) ───────────────────────────
// The guard describe above never reaches the answer-key read, so it needs no
// question pool. This describe runs a REAL graded session end-to-end against a
// seeded VFR-RT pool (8 short_answer + 9 dialog_fill + 8 multiple_choice = 25),
// then asserts the FULL results contract (mig 115) — a superset of the submit
// scalar contract that adds passed_per_part + the per-question answer-key reveal.
// Two distinct fixtures (all-pass + part-2-fail) per code-style.md §7 so a
// regression that hardcodes a single return value fails at least one case.

type StartedSession = { session_id: string; question_ids: string[] }
type PoolQuestion = { id: string; question_type: string }
type ResultQuestion = {
  question_id: string
  question_type: string
  answers: Array<{ is_correct: boolean }>
  key: {
    correct_option_id?: string
    canonical_answer?: string
    accepted_synonyms?: unknown
    blanks?: unknown
  }
}
type VfrRtResults = {
  part1_pct: number
  part2_pct: number
  part3_pct: number
  passed_overall: boolean
  passed_per_part: { part1: boolean; part2: boolean; part3: boolean }
  correct_count: number
  total_questions: number
  questions: ResultQuestion[]
}

test.describe('Red Team: get_vfr_rt_exam_results RPC — success / output contract', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let pool: VfrRtPool
  let orgId: string

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: seed.victimUserId })
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId })
  })

  // Two isolated steps (§7): (1) soft-delete this describe's own sessions,
  // (2) clear any active victim session so it can't leak into the next spec.
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
          console.log(`[vfr-rt-results-success] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
    }
    try {
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  // Run a full VFR-RT session as the victim: start → fetch frozen questions →
  // submit answers → read graded results. `failPart2` drives every dialog_fill
  // answer wrong (part2_pct → 0) while parts 1 and 3 stay correct.
  const runSession = async (opts: {
    failPart2: boolean
  }): Promise<{ started: StartedSession; questions: PoolQuestion[]; results: VfrRtResults }> => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL) // single-active invariant (#1011)

    const { data: startedRaw, error: startErr } = await victimClient.rpc(
      'start_vfr_rt_exam_session',
      { p_subject_id: pool.subjectId },
    )
    expect(startErr).toBeNull()
    expect(startedRaw).not.toBeNull() // non-vacuous: the pool is present
    const started = startedRaw as StartedSession
    createdSessionIds.add(started.session_id)

    const { data: questionsRaw, error: qErr } = await victimClient.rpc(
      'get_vfr_rt_exam_questions',
      { p_session_id: started.session_id },
    )
    expect(qErr).toBeNull()
    expect(Array.isArray(questionsRaw)).toBe(true) // §5 cast-guard before indexing
    const questions = questionsRaw as PoolQuestion[]
    expect(questions.length).toBe(25)

    const answers = buildVfrRtAnswers(questions, { failPart2: opts.failPart2 })
    // Non-vacuous: one answer per question — guards a silent unknown-type skip
    // in the helper that would otherwise under-count the graded payload.
    expect(answers.length).toBe(questions.length)
    const { data: submitRaw, error: submitErr } = await victimClient.rpc(
      'submit_vfr_rt_exam_answers',
      { p_session_id: started.session_id, p_answers: answers },
    )
    expect(submitErr).toBeNull()
    expect(submitRaw).not.toBeNull()

    const { data: resultsRaw, error: resultsErr } = await victimClient.rpc(
      'get_vfr_rt_exam_results',
      { p_session_id: started.session_id },
    )
    expect(resultsErr).toBeNull()
    expect(resultsRaw).not.toBeNull()
    return { started, questions, results: resultsRaw as VfrRtResults }
  }

  test('returns a full-marks graded contract with per-question answer keys when every part is correct', async () => {
    const { started, questions, results } = await runSession({ failPart2: false })

    expect(results.part1_pct).toBe(100)
    expect(results.part2_pct).toBe(100)
    expect(results.part3_pct).toBe(100)
    expect(results.passed_overall).toBe(true)
    expect(results.passed_per_part).toEqual({ part1: true, part2: true, part3: true })
    expect(results.correct_count).toBe(25)
    expect(results.total_questions).toBe(25)

    // Full review payload: one entry per session question, each carrying the
    // student's graded answer rows and the per-type revealed answer key.
    expect(results.questions.length).toBe(25)
    for (const q of results.questions) {
      expect(typeof q.question_id).toBe('string')
      expect(Array.isArray(q.answers)).toBe(true)
      for (const a of q.answers) {
        expect(typeof a.is_correct).toBe('boolean')
      }
      if (q.question_type === 'multiple_choice') {
        expect(q.key.correct_option_id).toBe(VFR_RT_MC_CORRECT)
      } else if (q.question_type === 'short_answer') {
        expect(typeof q.key.canonical_answer).toBe('string')
        expect(Array.isArray(q.key.accepted_synonyms)).toBe(true)
      } else if (q.question_type === 'dialog_fill') {
        expect(Array.isArray(q.key.blanks)).toBe(true)
      } else {
        throw new Error(`Unhandled question_type in answer-key assertion: ${q.question_type}`)
      }
    }

    // CY3 org-filter positive control (mig 127): every question the runner
    // served is a member of the pool seeded for the victim's own org — proving
    // the org filter admits the tenant's questions. The cross-org negative is
    // covered by rpc-correct-option-id-isolation / cross-tenant specs.
    for (const q of questions) {
      expect(pool.allIds).toContain(q.id)
    }
    expect(started.question_ids.length).toBe(25)
  })

  test('scores part 2 at exactly zero when every dialog_fill answer is wrong', async () => {
    const { results } = await runSession({ failPart2: true })

    expect(results.part1_pct).toBe(100)
    expect(results.part2_pct).toBe(0) // §7 zero-case: exact equality, not a bound
    expect(results.part3_pct).toBe(100)
    expect(results.passed_overall).toBe(false)
    expect(results.passed_per_part).toEqual({ part1: true, part2: false, part3: true })
    expect(results.correct_count).toBe(16)
    expect(results.total_questions).toBe(25)

    // The dialog_fill rows are present but graded incorrect (non-vacuous).
    const df = results.questions.filter((q) => q.question_type === 'dialog_fill')
    expect(df.length).toBe(9)
    for (const q of df) {
      for (const a of q.answers) {
        expect(a.is_correct).toBe(false)
      }
    }
  })
})
