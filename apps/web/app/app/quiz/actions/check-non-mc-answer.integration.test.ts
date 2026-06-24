// App-layer integration tier (#925) — checkNonMcAnswer.
//
// Exercises the real checkNonMcAnswer Server Action against real Postgres under
// real RLS, driving the check_non_mc_answer RPC (mig 119). Covers both grading
// paths (short_answer + dialog_fill), the full output contract, session
// ownership/membership guards, and unauthenticated rejection.
//
// seedQuestions only seeds multiple_choice, so the non-MC questions are inserted
// directly via the service-role admin client here (with question_type +
// canonical_answer / accepted_synonyms / blanks_config / dialog_template per the
// mig 094 column-discriminator CHECK).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedOpenSession } from '@/lib/integration-support/fixtures'
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
import { checkNonMcAnswer } from './check-non-mc-answer'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-nonmc-a-${suffix}@test.local`
const emailB = `int-nonmc-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let bankId: string
let shortId: string
let dialogId: string
let extraShortId: string

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

let sessionIdA: string

async function insertNonMcQuestion(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: refs.subjectId,
      topic_id: refs.topicId,
      options: [],
      correct_option_id: null,
      difficulty: 'medium',
      status: 'active',
      created_by: studentAId,
      // questions.explanation_text is NOT NULL — give every fixture a default so
      // the dialog_fill / out-of-session inserts (which don't override it) are valid.
      explanation_text: 'Integration test explanation.',
      ...row,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertNonMcQuestion: ${error.message}`)
  const id = (data as { id: string } | null)?.id
  if (!id) throw new Error('insertNonMcQuestion: no id returned')
  return id
}

describe('checkNonMcAnswer (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-nonmc ${suffix}`, slug: `int-nonmc-${suffix}` })
    studentAId = await createTestUser({ admin, orgId, email: emailA, password, role: 'student' })
    studentBId = await createTestUser({ admin, orgId, email: emailB, password, role: 'student' })

    refs = await seedReferenceData({
      admin,
      subjectCode: `NMC_${suffix}`,
      subjectName: `NonMC Subject ${suffix}`,
      topicCode: `NMC_${suffix}_T1`,
      topicName: `NonMC Topic ${suffix}`,
    })

    // Reuse seedQuestions only to materialize the org's question bank, then
    // insert non-MC questions into that same bank.
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    bankId = seeded.bankId

    shortId = await insertNonMcQuestion({
      question_text: 'Read back the landing clearance.',
      question_type: 'short_answer',
      canonical_answer: 'cleared to land',
      accepted_synonyms: ['clear to land'],
      explanation_text: 'Standard landing readback.',
    })

    dialogId = await insertNonMcQuestion({
      question_text: 'Complete the ATC exchange.',
      question_type: 'dialog_fill',
      dialog_template: '[atc] {{0}} runway {{1}}.',
      blanks_config: [
        { index: 0, canonical: 'cleared to land', synonyms: [] },
        { index: 1, canonical: '27', synonyms: ['two seven'] },
      ],
    })

    // A short_answer question NOT placed in A's session — for the membership guard.
    extraShortId = await insertNonMcQuestion({
      question_text: 'Out-of-session question.',
      question_type: 'short_answer',
      canonical_answer: 'roger',
    })

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    const opened = await seedOpenSession({
      studentClient: studentAClient,
      questionIds: [shortId, dialogId],
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    sessionIdA = opened.sessionId
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

  it('grades a correct short_answer and returns the canonical answer + explanation', async () => {
    await signInAs(emailA, password)
    const result = await checkNonMcAnswer({
      questionId: shortId,
      sessionId: sessionIdA,
      responseText: 'Cleared To Land',
    })
    expect(result.success).toBe(true)
    if (!result.success || result.questionType !== 'short_answer') throw new Error('unexpected')
    expect(result.isCorrect).toBe(true)
    expect(result.correctAnswer).toBe('cleared to land')
    expect(result.explanationText).toBe('Standard landing readback.')
    expect(result.explanationImageUrl).toBeNull()
  })

  it('grades a wrong short_answer as incorrect while still revealing the canonical', async () => {
    // Distinct second fixture value (incorrect) so a hardcoded is_correct=true
    // regression fails here — pairs with the correct case above (§7).
    await signInAs(emailA, password)
    const result = await checkNonMcAnswer({
      questionId: shortId,
      sessionId: sessionIdA,
      responseText: 'go around',
    })
    expect(result.success).toBe(true)
    if (!result.success || result.questionType !== 'short_answer') throw new Error('unexpected')
    expect(result.isCorrect).toBe(false)
    expect(result.correctAnswer).toBe('cleared to land')
  })

  it('grades a fully-correct dialog_fill and returns per-blank canonicals', async () => {
    await signInAs(emailA, password)
    const result = await checkNonMcAnswer({
      questionId: dialogId,
      sessionId: sessionIdA,
      blankAnswers: [
        { index: 0, text: 'cleared to land' },
        { index: 1, text: 'two seven' },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success || result.questionType !== 'dialog_fill') throw new Error('unexpected')
    expect(result.isCorrect).toBe(true)
    expect(result.blanks).toHaveLength(2)
    expect(result.blanks.map((b) => b.isCorrect)).toEqual([true, true])
    expect(result.blanks.find((b) => b.index === 1)?.canonical).toBe('27')
  })

  it('grades a partially-filled dialog_fill as incorrect (full-coverage semantics)', async () => {
    // Only one of two blanks correct → top-level is_correct must be false even
    // though the submitted blank is right. Distinct from the all-correct case.
    await signInAs(emailA, password)
    const result = await checkNonMcAnswer({
      questionId: dialogId,
      sessionId: sessionIdA,
      blankAnswers: [
        { index: 0, text: 'cleared to land' },
        { index: 1, text: 'nine' },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success || result.questionType !== 'dialog_fill') throw new Error('unexpected')
    expect(result.isCorrect).toBe(false)
    expect(result.blanks.find((b) => b.index === 0)?.isCorrect).toBe(true)
    expect(result.blanks.find((b) => b.index === 1)?.isCorrect).toBe(false)
  })

  it('returns Question not in session for a question outside the session', async () => {
    // Non-vacuous: the success tests above prove in-session questions resolve.
    await signInAs(emailA, password)
    const result = await checkNonMcAnswer({
      questionId: extraShortId,
      sessionId: sessionIdA,
      responseText: 'roger',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Question not in session')
  })

  it('returns Session not found for another students session', async () => {
    // Cross-user isolation. Non-vacuous: B can grade in B's own session (next test).
    await signInAs(emailB, password)
    const result = await checkNonMcAnswer({
      questionId: shortId,
      sessionId: sessionIdA,
      responseText: 'cleared to land',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Session not found')
  })

  it('resolves successfully for the authenticated students own session', async () => {
    const { sessionId: bSessionId } = await seedOpenSession({
      studentClient: studentBClient,
      questionIds: [shortId, dialogId],
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailB, password)
    const result = await checkNonMcAnswer({
      questionId: shortId,
      sessionId: bSessionId,
      responseText: 'cleared to land',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unauthenticated caller', async () => {
    const result = await checkNonMcAnswer({
      questionId: shortId,
      sessionId: sessionIdA,
      responseText: 'cleared to land',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
