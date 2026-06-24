// App-layer integration tier (#925) — getQuizReportQuestions.
//
// Exercises the real getQuizReportQuestions helper (session ownership + completion
// guard, quiz_session_answers paginated SELECT, questions SELECT, get_report_correct_options
// RPC) against real Postgres under real RLS. Validates pagination, per-row shape,
// correct-option delivery, and RLS scoping across students.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCompletedSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-qrq-a-${suffix}@test.local`
const emailB = `int-qrq-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

let sessionIdA: string
let sessionIdB: string

describe('getQuizReportQuestions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-qrq ${suffix}`,
      slug: `int-qrq-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
    })

    studentBId = await createTestUser({
      admin,
      orgId,
      email: emailB,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `QQ_${suffix}`,
      subjectName: `QRQ Subject ${suffix}`,
      topicCode: `QQ_${suffix}_T1`,
      topicName: `QRQ Topic ${suffix}`,
    })

    // 12 questions → spans two pages (PAGE_SIZE=10).
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 12,
    })
    questionIds = seeded.questionIds

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Student A: 6 of 12 correct (first 6 'b', last 6 'a').
    const s = await seedCompletedSession({
      studentClient: studentAClient,
      questionIds,
      correctCount: 6,
      totalCount: 12,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    sessionIdA = s.sessionId

    // Student B: own completed session for RLS isolation.
    const sB = await seedCompletedSession({
      studentClient: studentBClient,
      questionIds,
      correctCount: 12,
      totalCount: 12,
    })
    sessionIdB = sB.sessionId
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId, studentBId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns 10 questions on page 1 with totalCount 12', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.totalCount).toBe(12)
    expect(r.questions).toHaveLength(10)
  })

  it('returns 2 questions on page 2', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 2 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions).toHaveLength(2)
  })

  it('returns empty questions array for an out-of-range page', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 3 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions).toHaveLength(0)
  })

  it('returns representative question shape with correct option and response time', async () => {
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    const q = r.questions[0]
    expect(q).toBeDefined()
    // seedQuestions produces MC questions — narrow to the MC variant for its fields.
    if (q?.questionType !== 'multiple_choice') throw new Error('expected multiple_choice variant')
    // seedQuestions sets correct_option_id='b'; get_report_correct_options delivers it post-session.
    expect(q.correctOptionId).toBe('b')
    // Options are a/b/c/d (seedQuestions seeds exactly 4 options per question).
    expect(q.options).toHaveLength(4)
    const optionIds = q.options.map((o) => o.id).sort()
    expect(optionIds).toEqual(['a', 'b', 'c', 'd'])
    // response_time_ms is 2000 from seedCompletedSession.
    expect(q?.responseTimeMs).toBe(2000)
    // question_text is non-empty (seedQuestions generates "Test question N?").
    expect(typeof q?.questionText).toBe('string')
    expect(q?.questionText.length).toBeGreaterThan(0)
  })

  it('delivers exactly 6 correct answers across page 1 and page 2', async () => {
    // answered_at can tie at ms resolution → do NOT assert per-position correctness;
    // assert the aggregate across both pages.
    await signInAs(emailA, password)

    const r1 = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })
    const r2 = await getQuizReportQuestions({ sessionId: sessionIdA, page: 2 })

    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
    if (!r1.ok || !r2.ok) throw new Error('page fetch failed')

    const allQuestions = [...r1.questions, ...r2.questions]
    const correctCount = allQuestions.filter((q) => q.isCorrect).length
    expect(correctCount).toBe(6)
  })

  it('returns ok:false for another students completed session', async () => {
    // Non-vacuous: B's session exists and is completed. If RLS leaks it, A would
    // see questions. ok:false proves student_id scoping.
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdB, page: 1 })

    expect(r.ok).toBe(false)
  })

  it('returns ok:true and questions for the authenticated students own session', async () => {
    // Paired positive assertion so the negative RLS check above is non-vacuous.
    await signInAs(emailA, password)

    const r = await getQuizReportQuestions({ sessionId: sessionIdA, page: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Non-MC report path: the new get_report_answer_keys RPC site (code-style §7
// HARD — a NEW app-layer query site requires an integration test). Exercises
// getQuizReportQuestions end-to-end for a completed dialog_fill + short_answer
// session against real Postgres, asserting the per-blank and short-answer
// canonicals surface and that the dialog question collapses to ONE entry.
// ---------------------------------------------------------------------------

describe('getQuizReportQuestions — non-MC report (app-layer integration)', () => {
  const nmSuffix = Date.now() + 2
  const nmEmail = `int-qrq-nm-${nmSuffix}@test.local`
  const nmOtherEmail = `int-qrq-nm-other-${nmSuffix}@test.local`
  const nmAdminEmail = `int-qrq-nm-admin-${nmSuffix}@test.local`
  const nmPassword = 'test-pass-123'

  let nmOrgId: string
  let nmAdminId: string
  let nmStudentId: string
  let nmOtherStudentId: string
  let nmRefs: ReferenceIds
  let nmBankId: string
  let nmStudentClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
  let nmSessionId: string
  let shortAnswerId: string
  let dialogFillId: string

  const SA_CANONICAL = 'mayday mayday mayday'
  const DF_B0 = 'cleared'
  const DF_B1 = 'runway two seven'
  const DF_B2 = 'wind calm'

  async function insertQuestion(row: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin.from('questions').insert(row).select('id').single()
    if (error) throw new Error(`insertQuestion: ${error.message}`)
    const id = (data as { id: string } | null)?.id
    if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
    return id
  }

  beforeAll(async () => {
    nmOrgId = await createTestOrg({
      admin,
      name: `int-qrq-nm ${nmSuffix}`,
      slug: `int-qrq-nm-${nmSuffix}`,
    })
    nmAdminId = await createTestUser({
      admin,
      orgId: nmOrgId,
      email: nmAdminEmail,
      password: nmPassword,
      role: 'admin',
    })
    nmStudentId = await createTestUser({
      admin,
      orgId: nmOrgId,
      email: nmEmail,
      password: nmPassword,
      role: 'student',
    })
    // A second student in the same org, with NO session — for the isolation check.
    nmOtherStudentId = await createTestUser({
      admin,
      orgId: nmOrgId,
      email: nmOtherEmail,
      password: nmPassword,
      role: 'student',
    })

    nmRefs = await seedReferenceData({
      admin,
      subjectCode: `QQNM_${nmSuffix}`,
      subjectName: `QRQ NonMC Subject ${nmSuffix}`,
      topicCode: `QQNM_${nmSuffix}_T1`,
      topicName: `QRQ NonMC Topic ${nmSuffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: nmOrgId,
        name: `QRQ NonMC Bank ${nmSuffix}`,
        created_by: nmAdminId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    nmBankId = (bank as { id: string }).id

    const base = {
      organization_id: nmOrgId,
      bank_id: nmBankId,
      subject_id: nmRefs.subjectId,
      topic_id: nmRefs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: nmAdminId,
    }

    shortAnswerId = await insertQuestion({
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: SA_CANONICAL,
      explanation_text: 'SA explanation',
    })
    dialogFillId = await insertQuestion({
      ...base,
      question_type: 'dialog_fill',
      question_text: 'Three-blank dialog',
      dialog_template: '[atc] {{0|cleared}} to land {{1|runway two seven}}, {{2|wind calm}}.',
      blanks_config: [
        { index: 0, canonical: DF_B0, synonyms: [] },
        { index: 1, canonical: DF_B1, synonyms: [] },
        { index: 2, canonical: DF_B2, synonyms: [] },
      ],
      explanation_text: 'DF explanation',
    })

    nmStudentClient = await getAuthenticatedClient({ email: nmEmail, password: nmPassword })

    // Start a session over the two non-MC questions, then batch-submit answers:
    // short_answer correct, dialog blank 2 wrong (partial credit).
    const { data: startData, error: startErr } = await nmStudentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: nmRefs.subjectId,
      p_topic_id: nmRefs.topicId,
      p_question_ids: [shortAnswerId, dialogFillId],
    })
    if (startErr) throw new Error(`start_quiz_session: ${startErr.message}`)
    if (typeof startData !== 'string') throw new Error('start_quiz_session: no session id')
    nmSessionId = startData

    const { error: batchErr } = await nmStudentClient.rpc('batch_submit_quiz', {
      p_session_id: nmSessionId,
      p_answers: [
        { question_id: shortAnswerId, response_text: SA_CANONICAL, response_time_ms: 4000 },
        { question_id: dialogFillId, blank_index: 0, response_text: DF_B0, response_time_ms: 1000 },
        { question_id: dialogFillId, blank_index: 1, response_text: DF_B1, response_time_ms: 1000 },
        {
          question_id: dialogFillId,
          blank_index: 2,
          response_text: 'wrong',
          response_time_ms: 1000,
        },
      ],
    })
    if (batchErr) throw new Error(`batch_submit_quiz: ${batchErr.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({
        admin,
        orgId: nmOrgId,
        userIds: [nmAdminId, nmStudentId, nmOtherStudentId],
      })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [nmRefs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('surfaces the short-answer canonical for the owning student', async () => {
    await signInAs(nmEmail, nmPassword)

    const r = await getQuizReportQuestions({ sessionId: nmSessionId, page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)

    const sa = r.questions.find((q) => q.questionId === shortAnswerId)
    expect(sa).toBeDefined()
    if (sa?.questionType !== 'short_answer') throw new Error('expected short_answer variant')
    expect(sa.responseText).toBe(SA_CANONICAL)
    expect(sa.canonicalAnswer).toBe(SA_CANONICAL)
    expect(sa.isCorrect).toBe(true)
  })

  it('collapses the dialog question to one entry with per-blank canonicals', async () => {
    await signInAs(nmEmail, nmPassword)

    const r = await getQuizReportQuestions({ sessionId: nmSessionId, page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)

    // Two distinct questions, not four answer rows (3 dialog blanks + 1 SA).
    expect(r.questions).toHaveLength(2)
    expect(r.totalCount).toBe(2)

    const df = r.questions.find((q) => q.questionId === dialogFillId)
    expect(df).toBeDefined()
    if (df?.questionType !== 'dialog_fill') throw new Error('expected dialog_fill variant')
    expect(df.totalBlanks).toBe(3)
    // blank 2 was answered wrong → 2 of 3 correct, question not fully correct.
    expect(df.correctCount).toBe(2)
    expect(df.isCorrect).toBe(false)
    // Per-blank canonicals come from get_report_answer_keys (the new RPC site).
    const byIndex = new Map(df.blanks.map((b) => [b.index, b.canonical]))
    expect(byIndex.get(0)).toBe(DF_B0)
    expect(byIndex.get(1)).toBe(DF_B1)
    expect(byIndex.get(2)).toBe(DF_B2)
  })

  it('returns the owning students own non-MC session (pairs the isolation check)', async () => {
    // Positive control so the negative isolation assertion below is non-vacuous.
    await signInAs(nmEmail, nmPassword)

    const r = await getQuizReportQuestions({ sessionId: nmSessionId, page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.questions).toHaveLength(2)
  })

  it('does not leak the non-MC session to a different student in the same org', async () => {
    // Non-vacuous: nmOtherStudent is a real, active student in the SAME org who
    // simply does not own this session. ok:false proves student_id scoping, not
    // a cross-org block.
    await signInAs(nmOtherEmail, nmPassword)

    const r = await getQuizReportQuestions({ sessionId: nmSessionId, page: 1 })
    expect(r.ok).toBe(false)
  })
})
