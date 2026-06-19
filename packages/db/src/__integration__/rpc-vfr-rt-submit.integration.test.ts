/**
 * A.11 — VFR RT exam: submit_vfr_rt_exam_answers + get_question_authoring_fields.
 *
 * submit_vfr_rt_exam_answers covers:
 *   - happy path (passing: all parts >= 75)
 *   - happy path (failing Part 2 only — second distinct fixture outcome)
 *   - idempotent re-submit returns same result without inserting new rows
 *   - invalid question_id raises
 *   - partial answers (some blanks missing) — missing scores as 0
 *   - timer-expiry guard (session's started_at backdated via service-role)
 *
 * Legacy RPC mode whitelist (#838) covers:
 *   - batch_submit_quiz / submit_quiz_answer / complete_quiz_session each
 *     reject a vfr_rt_exam session with unsupported_session_mode
 *
 * get_question_authoring_fields covers:
 *   - admin gets the four answer-key columns
 *   - student caller is rejected
 *   - cross-org admin is rejected
 *
 * Shared beforeAll seeds: RT subject (mig 097), 8 SA + 9 DF + 8 MC questions,
 * exam_configs row. Each it() that modifies state starts its own session so
 * tests stay isolated.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

const admin = getAdminClient()
const suffix = Date.now()

// ─── RT seed helpers (duplicated from rpc-vfr-rt-start — each file must be
//     self-contained; tests run in separate Vitest workers) ──────────────────

async function getRtRefs(): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const { data: sub, error: subErr } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (subErr || !sub) throw new Error('getRtRefs: RT subject not found')
  const { data: topics, error: topErr } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', sub.id)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (topErr) throw new Error(`getRtRefs: ${topErr.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t: { id: string; code: string }) => [t.code, t.id]),
  )
  if (!byCode.P1_ACRONYMS || !byCode.P2_DIALOG || !byCode.P3_MC)
    throw new Error('getRtRefs: RT topics missing')
  return {
    rtSubjectId: sub.id,
    p1TopicId: byCode.P1_ACRONYMS,
    p2TopicId: byCode.P2_DIALOG,
    p3TopicId: byCode.P3_MC,
  }
}

async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureBank: ${lookupErr.message}`)
  if (existing) return existing.id as string
  const { data, error } = await admin
    .from('question_banks')
    .insert({ organization_id: orgId, name: `Submit Test Bank ${suffix}`, created_by: adminId })
    .select('id')
    .single()
  if (error) throw new Error(`ensureBank insert: ${error.message}`)
  return data.id as string
}

interface SaQuestion {
  id: string
  canonical: string
}
interface DfQuestion {
  id: string
  blanksConfig: Array<{ index: number; canonical: string; synonyms: string[] }>
}
interface McQuestion {
  id: string
  correctOption: string
}

async function insertSaQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p1TopicId: string,
  idx: number,
): Promise<SaQuestion> {
  const canonical = `answer_sa_${idx}`
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p1TopicId,
      question_text: `SA submit ${idx} ${suffix}?`,
      explanation_text: `SA submit explanation ${idx}`,
      question_type: 'short_answer',
      canonical_answer: canonical,
      accepted_synonyms: [`syn_${idx}`],
      options: [],
      blanks_config: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertSaQuestion: ${error.message}`)
  return { id: data.id as string, canonical }
}

async function insertDfQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p2TopicId: string,
  idx: number,
): Promise<DfQuestion> {
  const blanksConfig = [
    { index: 0, canonical: `callsign_${idx}`, synonyms: [`cs_${idx}`] },
    { index: 1, canonical: `level_${idx}`, synonyms: [`lv_${idx}`] },
  ]
  const template = `[atc] {{0|callsign_${idx};cs_${idx}}} descend to {{1|level_${idx};lv_${idx}}}.`
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p2TopicId,
      question_text: `DF submit ${idx} ${suffix}?`,
      explanation_text: `DF submit explanation ${idx}`,
      question_type: 'dialog_fill',
      dialog_template: template,
      blanks_config: blanksConfig,
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDfQuestion: ${error.message}`)
  return { id: data.id as string, blanksConfig }
}

async function insertMcQuestion(
  orgId: string,
  bankId: string,
  adminId: string,
  rtSubjectId: string,
  p3TopicId: string,
  idx: number,
): Promise<McQuestion> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: rtSubjectId,
      topic_id: p3TopicId,
      question_text: `MC submit ${idx} ${suffix}?`,
      explanation_text: `MC submit explanation ${idx}`,
      question_type: 'multiple_choice',
      options: [
        { id: 'a', text: `A ${idx}` },
        { id: 'b', text: `B ${idx}` },
        { id: 'c', text: `C ${idx}` },
        { id: 'd', text: `D ${idx}` },
      ],
      // MC answer key in its own REVOKE-gated column (#823, mig 111).
      correct_option_id: 'b',
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertMcQuestion: ${error.message}`)
  return { id: data.id as string, correctOption: 'b' }
}

// ─── shared fixture state ─────────────────────────────────────────────────────

let orgId: string
let adminUserId: string
let studentId: string
let studentClient: SupabaseClient
let adminClient: SupabaseClient
let rtSubjectId: string
let saQuestions: SaQuestion[]
let dfQuestions: DfQuestion[]
let mcQuestions: McQuestion[]
const userIds: string[] = []

beforeAll(async () => {
  const refs = await getRtRefs()
  rtSubjectId = refs.rtSubjectId

  orgId = await createTestOrg({
    admin,
    name: `RT Submit Org ${suffix}`,
    slug: `rt-submit-${suffix}`,
  })
  adminUserId = await createTestUser({
    admin,
    orgId,
    email: `admin-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'admin',
  })
  userIds.push(adminUserId)
  studentId = await createTestUser({
    admin,
    orgId,
    email: `student-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
    role: 'student',
  })
  userIds.push(studentId)
  studentClient = await getAuthenticatedClient({
    email: `student-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
  })
  adminClient = await getAuthenticatedClient({
    email: `admin-rtsub-${suffix}@test.local`,
    password: 'test-pass-123',
  })

  const bankId = await ensureBank(orgId, adminUserId)

  saQuestions = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      insertSaQuestion(orgId, bankId, adminUserId, rtSubjectId, refs.p1TopicId, 400 + i),
    ),
  )
  dfQuestions = await Promise.all(
    Array.from({ length: 9 }, (_, i) =>
      insertDfQuestion(orgId, bankId, adminUserId, rtSubjectId, refs.p2TopicId, 400 + i),
    ),
  )
  mcQuestions = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      insertMcQuestion(orgId, bankId, adminUserId, rtSubjectId, refs.p3TopicId, 400 + i),
    ),
  )

  const { error: ecErr } = await admin.from('exam_configs').insert({
    organization_id: orgId,
    subject_id: rtSubjectId,
    enabled: true,
    total_questions: 25,
    time_limit_seconds: 1800,
    pass_mark: 75,
  })
  if (ecErr) throw new Error(`exam_configs insert: ${ecErr.message}`)
})

afterAll(async () => {
  await cleanupTestData({ admin, orgId, userIds })
})

/** Start a fresh vfr_rt_exam session and return its id + the frozen question list. */
async function startSession(): Promise<{ sessionId: string; questionIds: string[] }> {
  const { data, error } = await studentClient.rpc('start_vfr_rt_exam_session', {
    p_subject_id: rtSubjectId,
  })
  if (error) throw new Error(`startSession: ${error.message}`)
  const r = data as unknown as { session_id: string; question_ids: string[] }
  if (!r.session_id) throw new Error('startSession: no session_id in result')
  return { sessionId: r.session_id, questionIds: r.question_ids }
}

/** Force-end a session so the next startSession creates a new one. */
async function forceEndSession(sessionId: string): Promise<void> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .update({
      ended_at: new Date().toISOString(),
      correct_count: 0,
      score_percentage: 0,
      passed: false,
    })
    .eq('id', sessionId)
    .select('id')
  if (error) throw new Error(`forceEndSession: ${error.message}`)
  // §5 zero-row observability: this helper always targets exactly one row —
  // a silent zero-row no-op means the next startSession resumes a stale session.
  if ((data?.length ?? 0) === 0) throw new Error('forceEndSession: no session row matched')
}

/** Build an all-correct answers payload for the given session's question list.
 *  Uses the canonical answers for SA, first blank canonical for DF, and the
 *  correct option letter for MC.
 */
function buildAllCorrectAnswers(
  questionIds: string[],
  saQs: SaQuestion[],
  dfQs: DfQuestion[],
  mcQs: McQuestion[],
): object[] {
  const saById = Object.fromEntries(saQs.map((q) => [q.id, q]))
  const dfById = Object.fromEntries(dfQs.map((q) => [q.id, q]))
  const mcById = Object.fromEntries(mcQs.map((q) => [q.id, q]))
  const answers: object[] = []
  for (const qId of questionIds) {
    if (saById[qId]) {
      answers.push({ question_id: qId, response_text: saById[qId]!.canonical })
    } else if (dfById[qId]) {
      for (const blank of dfById[qId]!.blanksConfig) {
        answers.push({ question_id: qId, blank_index: blank.index, response_text: blank.canonical })
      }
    } else if (mcById[qId]) {
      answers.push({ question_id: qId, selected_option_id: mcById[qId]!.correctOption })
    }
  }
  return answers
}

// ─── submit_vfr_rt_exam_answers ───────────────────────────────────────────────

describe('RPC: submit_vfr_rt_exam_answers — happy path (all correct, all parts pass)', () => {
  it('returns per-part percentages 100/100/100, passed_overall true, correct_count > 0', async () => {
    const { sessionId, questionIds } = await startSession()
    const answers = buildAllCorrectAnswers(questionIds, saQuestions, dfQuestions, mcQuestions)

    const { data, error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(error).toBeNull()

    const result = data as unknown as {
      session_id: string
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
      correct_count: number
      total_questions: number
    }
    expect(result.session_id).toBe(sessionId)
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(100)
    expect(result.passed_overall).toBe(true)
    expect(Number(result.correct_count)).toBeGreaterThan(0)
    expect(Number(result.total_questions)).toBe(25)

    // quiz_sessions should now have ended_at set and passed = true
    const { data: session, error: sErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed, correct_count')
      .eq('id', sessionId)
      .single()
    expect(sErr).toBeNull()
    expect(session?.ended_at).not.toBeNull()
    expect(session?.passed).toBe(true)
  })
})

describe('RPC: submit_vfr_rt_exam_answers — Part 2 fail only (second distinct fixture)', () => {
  it('returns part2_pct < 75, passed_overall false, part1_pct and part3_pct at 100', async () => {
    const { sessionId, questionIds } = await startSession()

    // Build correct answers for Part 1 and Part 3, but submit WRONG responses for Part 2
    const saById = Object.fromEntries(saQuestions.map((q) => [q.id, q]))
    const dfById = Object.fromEntries(dfQuestions.map((q) => [q.id, q]))
    const mcById = Object.fromEntries(mcQuestions.map((q) => [q.id, q]))
    const answers: object[] = []
    for (const qId of questionIds) {
      if (saById[qId]) {
        // Part 1 — correct
        answers.push({ question_id: qId, response_text: saById[qId]!.canonical })
      } else if (dfById[qId]) {
        // Part 2 — deliberately wrong answer for every blank
        for (const blank of dfById[qId]!.blanksConfig) {
          answers.push({
            question_id: qId,
            blank_index: blank.index,
            response_text: 'WRONG_ANSWER_XYZ',
          })
        }
      } else if (mcById[qId]) {
        // Part 3 — correct
        answers.push({ question_id: qId, selected_option_id: mcById[qId]!.correctOption })
      }
    }

    const { data, error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(error).toBeNull()
    const result = data as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
    }
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(0)
    expect(Number(result.part3_pct)).toBe(100)
    expect(result.passed_overall).toBe(false)
  })
})

describe('RPC: submit_vfr_rt_exam_answers — idempotency and error paths', () => {
  it('re-submit of a completed session returns the same result without inserting new answer rows', async () => {
    const { sessionId, questionIds } = await startSession()
    const answers = buildAllCorrectAnswers(questionIds, saQuestions, dfQuestions, mcQuestions)

    const { data: first } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    const firstResult = first as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
    }

    // Count answer rows before second call
    const { data: rows1, error: rows1Err } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
    expect(rows1Err).toBeNull()
    const countBefore = (rows1 ?? []).length

    const { data: second, error: err2 } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(err2).toBeNull()
    const secondResult = second as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
    }

    // Same per-part pcts
    expect(Number(secondResult.part1_pct)).toBe(Number(firstResult.part1_pct))
    expect(Number(secondResult.part2_pct)).toBe(Number(firstResult.part2_pct))
    expect(Number(secondResult.part3_pct)).toBe(Number(firstResult.part3_pct))
    expect(secondResult.passed_overall).toBe(firstResult.passed_overall)

    // No new rows inserted
    const { data: rows2, error: rows2Err } = await admin
      .from('quiz_session_answers')
      .select('id')
      .eq('session_id', sessionId)
    expect(rows2Err).toBeNull()
    expect((rows2 ?? []).length).toBe(countBefore)
  })

  it('raises invalid_question_id_for_session when an answer carries a question_id not in the session', async () => {
    const { sessionId } = await startSession()

    const { error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: '00000000-0000-0000-0000-000000000000', response_text: 'anything' },
      ],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_question_id_for_session')

    await forceEndSession(sessionId)
  })

  it('rejects zero-padded and bare numeric blank_index as the same duplicate blank', async () => {
    // #856 (mig 113): the duplicate-key pre-check canonicalizes numeric blank_index,
    // so two dialog_fill entries for the SAME question with blank_index 1 (raw int)
    // and "01" (zero-padded text) are detected as the same blank and rejected. Before
    // the fix they slipped past the guard and silently collapsed at ON CONFLICT.
    const { sessionId, questionIds } = await startSession()

    try {
      // Non-vacuity: confirm the session actually contains a dialog_fill question whose
      // blanks_config has blank index 1 — otherwise the rejection could fire for an
      // unrelated reason (bad question_id, missing blank).
      const dfById = Object.fromEntries(dfQuestions.map((q) => [q.id, q]))
      const dfId = questionIds.find((id) => dfById[id] !== undefined)
      if (!dfId) throw new Error('no DF question in session')
      expect(dfById[dfId]!.blanksConfig.some((b) => b.index === 1)).toBe(true)
      const blankCanonical = dfById[dfId]!.blanksConfig.find((b) => b.index === 1)!.canonical

      const { error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
        p_session_id: sessionId,
        p_answers: [
          { question_id: dfId, blank_index: 1, response_text: blankCanonical },
          { question_id: dfId, blank_index: '01', response_text: blankCanonical },
        ],
      })
      expect(error).not.toBeNull()
      expect(error?.message).toContain('duplicate_answer_entry')
    } finally {
      // End the session even if an assertion throws, so it can't leak into later tests.
      await forceEndSession(sessionId)
    }
  })

  it('scores partial answers — unanswered questions contribute 0 to their part percentage', async () => {
    const { sessionId, questionIds } = await startSession()

    // Submit only the FIRST SA question (correct); leave all others unanswered
    const saById = Object.fromEntries(saQuestions.map((q) => [q.id, q]))
    const firstSaId = questionIds.find((id) => saById[id] !== undefined)
    if (!firstSaId) throw new Error('no SA question in session')

    const { data, error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: [{ question_id: firstSaId, response_text: saById[firstSaId]!.canonical }],
    })
    expect(error).toBeNull()
    const result = data as unknown as {
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
    }
    // Part 1 has 8 questions; only 1 answered correctly → pct = 100/8 = 12.5
    expect(Number(result.part1_pct)).toBe(12.5)
    // Part 2 and Part 3 have zero answers → 0
    expect(Number(result.part2_pct)).toBe(0)
    expect(Number(result.part3_pct)).toBe(0)
    expect(result.passed_overall).toBe(false)
  })

  it('timer-expiry guard — a submit past time_limit + 30s returns expired result with zeroed scores', async () => {
    // We cannot wait 30 minutes. Instead, INSERT a session row directly via the
    // service-role client with started_at set far in the past. The mig 079 trigger
    // (trg_quiz_sessions_immutable_columns) exempts service_role from the
    // immutability guard, so the INSERT is allowed to set started_at freely.
    // (INSERT not UPDATE — inserting the row from scratch via service_role bypasses
    //  the trigger's UPDATE restriction entirely.)

    // Resolve a frozen question list from one of the already-seeded sessions
    const { sessionId: templateSession, questionIds } = await startSession()
    await forceEndSession(templateSession)

    // Insert a backdated session directly via service-role
    const oldStartedAt = new Date(Date.now() - (1800 + 60) * 1000).toISOString()
    const { data: inserted, error: insErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'vfr_rt_exam',
        subject_id: rtSubjectId,
        config: { question_ids: questionIds },
        total_questions: 25,
        time_limit_seconds: 1800,
        started_at: oldStartedAt,
      })
      .select('id')
      .single()
    if (insErr) throw new Error(`backdated session insert: ${insErr.message}`)
    const expiredSessionId = inserted.id as string

    // Now attempt to submit answers — must hit the expiry guard, not grade
    const saById = Object.fromEntries(saQuestions.map((q) => [q.id, q]))
    const firstSaId = questionIds.find((id) => saById[id] !== undefined)
    if (!firstSaId) throw new Error('no SA question in frozen list')

    const { data, error } = await studentClient.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: expiredSessionId,
      p_answers: [{ question_id: firstSaId, response_text: saById[firstSaId]!.canonical }],
    })
    expect(error).toBeNull()
    const result = data as unknown as {
      expired: boolean
      part1_pct: number
      part2_pct: number
      part3_pct: number
      passed_overall: boolean
      correct_count: number
    }
    expect(result.expired).toBe(true)
    expect(Number(result.part1_pct)).toBe(0)
    expect(Number(result.part2_pct)).toBe(0)
    expect(Number(result.part3_pct)).toBe(0)
    expect(result.passed_overall).toBe(false)
    expect(Number(result.correct_count)).toBe(0)

    // An audit event 'vfr_rt_exam.expired' must have been emitted
    const { data: events, error: evErr } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('resource_id', expiredSessionId)
    expect(evErr).toBeNull()
    const types = (events ?? []).map((e: { event_type: string }) => e.event_type)
    expect(types).toContain('vfr_rt_exam.expired')
  })
})

// ─── Legacy RPC mode whitelist (#838) ─────────────────────────────────────────
//
// Migs 095b/095c/104 add a fail-closed mode whitelist to the legacy session
// RPCs: a vfr_rt_exam session answered/completed via the MC path would bypass
// per-part grading (mig 100). The legacy-mode happy paths live in
// rpc-batch-submit-quiz / rpc-submit-answer / rpc-complete-session — those are
// what make these rejections non-vacuous.

describe('legacy RPC mode whitelist (#838) — vfr_rt_exam sessions are rejected', () => {
  it('batch_submit_quiz rejects a vfr_rt_exam session with unsupported_session_mode', async () => {
    const { sessionId, questionIds } = await startSession()

    const { error } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [{ question_id: questionIds[0], selected_option: 'a', response_time_ms: 1000 }],
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_session_mode')

    await forceEndSession(sessionId)
  })

  it('submit_quiz_answer rejects a vfr_rt_exam session with unsupported_session_mode', async () => {
    const { sessionId, questionIds } = await startSession()

    const { error } = await studentClient.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionIds[0],
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_session_mode')

    await forceEndSession(sessionId)
  })

  it('complete_quiz_session rejects a vfr_rt_exam session with unsupported_session_mode', async () => {
    const { sessionId } = await startSession()

    const { error } = await studentClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('unsupported_session_mode')

    await forceEndSession(sessionId)
  })
})

// ─── get_question_authoring_fields ────────────────────────────────────────────

describe('RPC: get_question_authoring_fields', () => {
  let saId: string

  beforeAll(async () => {
    // Seed one SA question in the org's bank (bank was already created in the
    // outer beforeAll for the submit tests)
    const { data: bankRow } = await admin
      .from('question_banks')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()
    const bankId = bankRow?.id as string
    const refs = await getRtRefs()
    const { data, error } = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id: bankId,
        subject_id: refs.rtSubjectId,
        topic_id: refs.p1TopicId,
        question_text: `Auth fields test SA ${suffix}?`,
        explanation_text: 'Auth fields test explanation',
        question_type: 'short_answer',
        canonical_answer: 'visible_to_admin',
        accepted_synonyms: ['visible_syn'],
        options: [],
        blanks_config: [],
        difficulty: 'medium',
        status: 'active',
        created_by: adminUserId,
      })
      .select('id')
      .single()
    if (error) throw new Error(`authoring field SA seed: ${error.message}`)
    saId = data.id as string
  })

  it('admin in own org receives the four answer-key columns', async () => {
    const { data, error } = await adminClient.rpc('get_question_authoring_fields', {
      p_question_id: saId,
    })
    expect(error).toBeNull()
    const rows = data as unknown as Array<{
      canonical_answer: string
      accepted_synonyms: string[]
      dialog_template: string | null
      blanks_config: unknown[]
    }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.canonical_answer).toBe('visible_to_admin')
    expect(rows[0]!.accepted_synonyms).toContain('visible_syn')
  })

  it('student caller is rejected with forbidden', async () => {
    const { data, error } = await studentClient.rpc('get_question_authoring_fields', {
      p_question_id: saId,
    })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toContain('forbidden')
  })

  it('cross-org admin receives zero rows (not the answer key)', async () => {
    // Create a second org with an admin user
    const orgId2 = await createTestOrg({
      admin,
      name: `RT Cross Org ${suffix}`,
      slug: `rt-cross-${suffix}`,
    })
    const adminId2 = await createTestUser({
      admin,
      orgId: orgId2,
      email: `admin-rtcross-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    const crossAdminClient = await getAuthenticatedClient({
      email: `admin-rtcross-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    try {
      // The question saId belongs to orgId, not orgId2; cross-org admin sees 0 rows
      const { data, error } = await crossAdminClient.rpc('get_question_authoring_fields', {
        p_question_id: saId,
      })
      expect(error).toBeNull()
      const rows = data as unknown as unknown[]
      // Non-vacuity: the question row exists (confirmed above); the empty result
      // means the RPC's org filter correctly rejected the cross-org admin
      expect(rows).toHaveLength(0)
    } finally {
      // Cleanup must run even when an assertion above fails — otherwise the
      // second org leaks into later test runs.
      await cleanupTestData({ admin, orgId: orgId2, userIds: [adminId2] })
    }
  })
})
