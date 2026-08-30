// App-layer integration tier (#925, #991) — getAdminQuizReportSummary / getAdminQuizReportQuestions.
//
// #991 fixed the admin session report rendering non-MC sessions wrong: the admin feed now
// fetches `question_type` (so the builder no longer defaults everything to multiple_choice)
// and reads non-MC answer keys via the NEW get_admin_report_answer_keys RPC (migration
// 20260824000100) — a mocked-client unit test cannot see the real schema, so this exercises
// both against real Postgres under real RLS/SECURITY DEFINER guards (code-style.md §7 HARD
// rule for a new app-layer .rpc() site).
//
// Model: quiz-report-questions.integration.test.ts's non-MC describe block (same seeded
// short_answer + dialog_fill fixture). The dimension that file cannot cover — an ADMIN
// reading another student's completed session, scoped to their own organization — is what
// this file adds, plus the cross-org admin isolation check.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import {
  getAdminQuizReportQuestions,
  getAdminQuizReportSummary,
} from '@/lib/queries/admin-quiz-report'

const admin = getAdminClient()
const suffix = Date.now()

const adminEmail = `int-aqr-admin-${suffix}@test.local`
const studentEmail = `int-aqr-student-${suffix}@test.local`
// A second, unrelated org + admin — used only for the cross-org isolation check.
const otherOrgAdminEmail = `int-aqr-other-admin-${suffix}@test.local`
const password = 'test-pass-123'

// Sentinels so a mid-beforeAll failure leaves these falsy-checkable in afterAll (vitest
// still runs afterAll if beforeAll throws) — an unassigned `let` would make cleanup throw
// a SECOND error and mask the real setup failure.
let orgId = ''
let adminId = ''
let studentId = ''
let otherOrgId = ''
let otherOrgAdminId = ''
let refs: ReferenceIds | null = null
let bankId: string
let studentClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let sessionId: string
let shortAnswerId: string
let dialogFillId: string

const SA_CANONICAL = 'mayday mayday mayday'
// Deliberately DIFFERENT from the canonical: if both were the same string, asserting
// canonicalAnswer could not distinguish a value read from get_admin_report_answer_keys
// from one read off the student's own answer row (code-style.md §7 fallback-coincidence).
const SA_WRONG = 'pan pan pan'
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

describe('getAdminQuizReportSummary / getAdminQuizReportQuestions — non-MC admin report (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-aqr ${suffix}`,
      slug: `int-aqr-${suffix}`,
    })
    adminId = await createTestUser({
      admin,
      orgId,
      email: adminEmail,
      password,
      role: 'admin',
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })

    otherOrgId = await createTestOrg({
      admin,
      name: `int-aqr-other ${suffix}`,
      slug: `int-aqr-other-${suffix}`,
    })
    otherOrgAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: otherOrgAdminEmail,
      password,
      role: 'admin',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `AQR_${suffix}`,
      subjectName: `AQR Subject ${suffix}`,
      topicCode: `AQR_${suffix}_T1`,
      topicName: `AQR Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `AQR Bank ${suffix}`,
        created_by: adminId,
      })
      .select('id')
      .single()
    if (bankErr) throw new Error(`seed bank: ${bankErr.message}`)
    const seededBankId = (bank as { id: string } | null)?.id
    if (typeof seededBankId !== 'string' || seededBankId.length === 0) {
      throw new Error('seed bank: no id')
    }
    bankId = seededBankId

    const base = {
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
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

    studentClient = await getAuthenticatedClient({ email: studentEmail, password })

    // Start a session over the two non-MC questions, then batch-submit answers:
    // short_answer correct, dialog blank 2 wrong (partial credit).
    const { data: startData, error: startErr } = await studentClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: [shortAnswerId, dialogFillId],
    })
    if (startErr) throw new Error(`start_quiz_session: ${startErr.message}`)
    if (typeof startData !== 'string') throw new Error('start_quiz_session: no session id')
    sessionId = startData

    const { error: batchErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: [
        { question_id: shortAnswerId, response_text: SA_WRONG, response_time_ms: 4000 },
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
    // Presence guard: skip if beforeAll failed before assigning orgId.
    if (orgId) {
      try {
        await cleanupTestData({
          admin,
          orgId,
          userIds: [adminId, studentId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData(orgId): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (otherOrgId) {
      try {
        await cleanupTestData({
          admin,
          orgId: otherOrgId,
          userIds: [otherOrgAdminId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData(otherOrgId): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // FK-ordering gate (code-style.md §7 dependent step): cleanupReferenceData deletes the
    // seeded easa_subjects/easa_topics that are FK parents of the questions cleanupTestData
    // removes — keep it gated behind a clean test cleanup to avoid a 23503 FK violation.
    if (refs && errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('summarizes distinct answered questions separately from answer-row count for the owning org admin', async () => {
    // Non-vacuous: 4 answer rows (1 short_answer + 3 dialog blanks) collapse to 2 distinct
    // questions. If the summary regressed to counting raw rows for answeredQuestions, this
    // would read 4 instead of 2.
    await signInAs(adminEmail, password)

    const summary = await getAdminQuizReportSummary(sessionId)
    expect(summary).not.toBeNull()
    expect(summary!.answeredItems).toBe(4)
    expect(summary!.answeredQuestions).toBe(2)
    expect(summary!.studentId).toBe(studentId)
  })

  it('surfaces the short-answer canonical for the admin report', async () => {
    await signInAs(adminEmail, password)

    const r = await getAdminQuizReportQuestions({ sessionId, page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)

    const sa = r.questions.find((q) => q.questionId === shortAnswerId)
    expect(sa).toBeDefined()
    // Non-vacuous per #991: before the fix, question_type was never fetched by the admin
    // feed, so every question defaulted to 'multiple_choice' and this narrowing would throw.
    if (sa?.questionType !== 'short_answer') throw new Error('expected short_answer variant')
    expect(sa.responseText).toBe(SA_WRONG)
    expect(sa.canonicalAnswer).toBe(SA_CANONICAL)
    expect(sa.isCorrect).toBe(false)
  })

  it('collapses the dialog question to one entry with per-blank canonicals for the admin report', async () => {
    await signInAs(adminEmail, password)

    const r = await getAdminQuizReportQuestions({ sessionId, page: 1 })
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)

    // Two distinct questions, not four answer rows (3 dialog blanks + 1 short_answer).
    expect(r.questions).toHaveLength(2)
    expect(r.totalCount).toBe(2)

    const df = r.questions.find((q) => q.questionId === dialogFillId)
    expect(df).toBeDefined()
    if (df?.questionType !== 'dialog_fill') throw new Error('expected dialog_fill variant')
    expect(df.totalBlanks).toBe(3)
    // Blank 2 was answered wrong → 2 of 3 correct, question not fully correct.
    expect(df.correctCount).toBe(2)
    expect(df.isCorrect).toBe(false)
    // Per-blank canonicals come from get_admin_report_answer_keys (the new RPC site).
    const byIndex = new Map(df.blanks.map((b) => [b.index, b.canonical]))
    expect(byIndex.get(0)).toBe(DF_B0)
    expect(byIndex.get(1)).toBe(DF_B1)
    expect(byIndex.get(2)).toBe(DF_B2)
  })

  it("returns the session for the owning org's admin (pairs the cross-org isolation check)", async () => {
    // Positive control so the negative cross-org assertion below is non-vacuous.
    await signInAs(adminEmail, password)

    const summary = await getAdminQuizReportSummary(sessionId)
    expect(summary).not.toBeNull()

    const questions = await getAdminQuizReportQuestions({ sessionId, page: 1 })
    expect(questions.ok).toBe(true)
  })

  it('does not surface the session summary to an admin from a different organization', async () => {
    // Non-vacuous: the same-org admin sees this session (asserted in the paired test above).
    // otherOrgAdmin is a real, active admin — just in a different org — so a null result here
    // proves organization_id scoping, not "no admin has access at all".
    await signInAs(otherOrgAdminEmail, password)

    const summary = await getAdminQuizReportSummary(sessionId)
    expect(summary).toBeNull()
  })

  it('does not surface the session questions to an admin from a different organization', async () => {
    await signInAs(otherOrgAdminEmail, password)

    const r = await getAdminQuizReportQuestions({ sessionId, page: 1 })
    expect(r.ok).toBe(false)
  })
})
