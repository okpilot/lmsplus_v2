// App-layer integration tier (#925, #990) — fetchAnsweredItemCounts.
//
// A mocked-client unit test can't see the real schema, so this exercises the
// new quiz_session_answers `.select('session_id')` site against real Postgres
// (code-style.md §7 HARD rule for a new app-layer .from() site). The point of
// this file is the item-vs-question distinction: a dialog_fill question with
// several blanks produces one quiz_session_answers row PER BLANK, so a session
// answering one 3-blank dialog_fill must report 3 — not 1 (the question count).
// A count that collapsed to distinct questions would silently under-state the
// item-level denominator the two admin list surfaces (#990) need.
//
// Model: admin-quiz-report.integration.test.ts's dialog_fill fixture shape
// (same insertQuestion/start_quiz_session/batch_submit_quiz recipe). This
// helper runs on adminClient (service-role, no RLS), so unlike that file there
// is no admin sign-in or cross-org isolation dimension here — scoping is the
// caller's responsibility via the sessionIds it passes in.
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
} from '@/lib/integration-support/harness'
import { fetchAnsweredItemCounts } from '@/lib/queries/answered-item-counts'

const admin = getAdminClient()
const suffix = Date.now()

const studentEmail = `int-aic-student-${suffix}@test.local`
const password = 'test-pass-123'

// Sentinels so a mid-beforeAll failure leaves these falsy-checkable in afterAll (vitest
// still runs afterAll if beforeAll throws) — an unassigned `let` would make cleanup throw
// a SECOND error and mask the real setup failure.
let orgId = ''
let adminId = ''
let studentId = ''
let refs: ReferenceIds | null = null
let bankId: string
let studentClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let multiBlankSessionId: string
let singleItemSessionId: string
let emptySessionId: string

async function insertQuestion(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from('questions').insert(row).select('id').single()
  if (error) throw new Error(`insertQuestion: ${error.message}`)
  const id = (data as { id: string } | null)?.id
  if (typeof id !== 'string' || id.length === 0) throw new Error('insertQuestion: no id')
  return id
}

describe('fetchAnsweredItemCounts (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-aic ${suffix}`,
      slug: `int-aic-${suffix}`,
    })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `int-aic-admin-${suffix}@test.local`,
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

    refs = await seedReferenceData({
      admin,
      subjectCode: `AIC_${suffix}`,
      subjectName: `AIC Subject ${suffix}`,
      topicCode: `AIC_${suffix}_T1`,
      topicName: `AIC Topic ${suffix}`,
    })

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `AIC Bank ${suffix}`,
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

    // A single question with THREE blanks — the item-vs-question distinction under
    // test: this question contributes one quiz_session_answers row per blank, so a
    // count of distinct QUESTIONS would read 1 while the answer-ROW count reads 3.
    const dialogFillId = await insertQuestion({
      ...base,
      question_type: 'dialog_fill',
      question_text: 'Three-blank dialog',
      dialog_template: '[atc] {{0|cleared}} to land {{1|runway two seven}}, {{2|wind calm}}.',
      blanks_config: [
        { index: 0, canonical: 'cleared', synonyms: [] },
        { index: 1, canonical: 'runway two seven', synonyms: [] },
        { index: 2, canonical: 'wind calm', synonyms: [] },
      ],
      explanation_text: 'DF explanation',
    })
    const shortAnswerId = await insertQuestion({
      ...base,
      question_type: 'short_answer',
      question_text: 'Distress call?',
      canonical_answer: 'mayday mayday mayday',
      explanation_text: 'SA explanation',
    })

    studentClient = await getAuthenticatedClient({ email: studentEmail, password })

    // Session 1: one 3-blank dialog_fill question, all blanks answered — 3 answer
    // rows, 1 question. Auto-ends once its only question is fully answered.
    const { data: multiBlankStart, error: multiBlankStartErr } = await studentClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: refs.subjectId,
        p_topic_id: refs.topicId,
        p_question_ids: [dialogFillId],
      },
    )
    if (multiBlankStartErr) throw new Error(`start_quiz_session (1): ${multiBlankStartErr.message}`)
    if (typeof multiBlankStart !== 'string')
      throw new Error('start_quiz_session (1): no session id')
    multiBlankSessionId = multiBlankStart

    const { error: multiBlankSubmitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: multiBlankSessionId,
      p_answers: [
        {
          question_id: dialogFillId,
          blank_index: 0,
          response_text: 'cleared',
          response_time_ms: 1000,
        },
        {
          question_id: dialogFillId,
          blank_index: 1,
          response_text: 'runway two seven',
          response_time_ms: 1000,
        },
        {
          question_id: dialogFillId,
          blank_index: 2,
          response_text: 'wind calm',
          response_time_ms: 1000,
        },
      ],
    })
    if (multiBlankSubmitErr)
      throw new Error(`batch_submit_quiz (1): ${multiBlankSubmitErr.message}`)

    // Session 2: one short_answer question, answered — 1 answer row, 1 question.
    // Started AFTER session 1 ends (single-active-session invariant).
    const { data: singleItemStart, error: singleItemStartErr } = await studentClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: refs.subjectId,
        p_topic_id: refs.topicId,
        p_question_ids: [shortAnswerId],
      },
    )
    if (singleItemStartErr) throw new Error(`start_quiz_session (2): ${singleItemStartErr.message}`)
    if (typeof singleItemStart !== 'string')
      throw new Error('start_quiz_session (2): no session id')
    singleItemSessionId = singleItemStart

    const { error: singleItemSubmitErr } = await studentClient.rpc('batch_submit_quiz', {
      p_session_id: singleItemSessionId,
      p_answers: [
        {
          question_id: shortAnswerId,
          response_text: 'mayday mayday mayday',
          response_time_ms: 2000,
        },
      ],
    })
    if (singleItemSubmitErr)
      throw new Error(`batch_submit_quiz (2): ${singleItemSubmitErr.message}`)

    // Session 3: started but never answered — zero quiz_session_answers rows.
    // Started AFTER session 2 ends, left active; cleanupTestData hard-deletes
    // quiz_sessions by orgId regardless of ended_at, so leaving it active is safe.
    const { data: emptyStart, error: emptyStartErr } = await studentClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: refs.subjectId,
        p_topic_id: refs.topicId,
        p_question_ids: [shortAnswerId],
      },
    )
    if (emptyStartErr) throw new Error(`start_quiz_session (3): ${emptyStartErr.message}`)
    if (typeof emptyStart !== 'string') throw new Error('start_quiz_session (3): no session id')
    emptySessionId = emptyStart
  })

  afterAll(async () => {
    const errors: string[] = []
    if (orgId) {
      try {
        await cleanupTestData({
          admin,
          orgId,
          userIds: [adminId, studentId].filter((id) => id.length > 0),
        })
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
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

  it('counts answer ROWS per session — a multi-blank question counts once per blank, not once per question', async () => {
    const result = await fetchAnsweredItemCounts([
      multiBlankSessionId,
      singleItemSessionId,
      emptySessionId,
    ])
    expect(result.error).toBeNull()
    // Would read 1 (the distinct-question count) if this helper collapsed by question
    // instead of counting quiz_session_answers rows — that is the whole point of this test.
    expect(result.data.get(multiBlankSessionId)).toBe(3)
    expect(result.data.get(singleItemSessionId)).toBe(1)
    expect(result.data.has(emptySessionId)).toBe(false)
    expect(result.data.size).toBe(2)
  })

  it('resolves an empty map for an empty sessionIds list', async () => {
    const result = await fetchAnsweredItemCounts([])
    expect(result).toEqual({ data: new Map(), error: null })
  })
})
