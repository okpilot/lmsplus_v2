// App-layer integration tier (#925) — checkAnswer.
//
// Exercises the real checkAnswer Server Action against real Postgres under
// real RLS. Validates: correct answer + explanation, explanation image url,
// session-not-found for nonexistent session, cross-user session isolation,
// question-not-in-session guard, Zod parse rejection, unauthenticated rejection.
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
import { checkAnswer } from './check-answer'
import { completeQuiz } from './complete'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-check-a-${suffix}@test.local`
const emailB = `int-check-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]
let extraQuestionId: string

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

// Open session for A seeded in beforeAll for tests that share one without
// mutating it (checkAnswer does not end the session — only complete/batch-submit do).
let sessionIdA: string

describe('checkAnswer (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-check ${suffix}`,
      slug: `int-check-${suffix}`,
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
      subjectCode: `CHK_${suffix}`,
      subjectName: `Check Subject ${suffix}`,
      topicCode: `CHK_${suffix}_T1`,
      topicName: `Check Topic ${suffix}`,
    })

    // 3 questions that will be included in A's session.
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds

    // Update questions[2] to have an explanation image url.
    const { error: imgErr } = await admin
      .from('questions')
      .update({ explanation_image_url: 'https://test.local/expl.png' })
      .eq('id', questionIds[2])
    if (imgErr) throw new Error(`seed explanation_image_url: ${imgErr.message}`)

    // One extra question that is NOT included in A's session — for the
    // "question not in session" guard test.
    const seededExtra = await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    const seededExtraId = seededExtra.questionIds[0]
    if (!seededExtraId) throw new Error('seedQuestions(count:1) returned no question id')
    extraQuestionId = seededExtraId

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })

    // Seed A's open session with only the 3 questions (not the extra one).
    // checkAnswer does not mutate session state, so it is safe to share across tests.
    const opened = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
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

  it('returns the correct answer and explanation for a question in the session', async () => {
    await signInAs(emailA, password)

    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: sessionIdA,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe('b')
    expect(result.explanationText).toBeTruthy()
    expect(typeof result.explanationText).toBe('string')
    expect(result.explanationImageUrl).toBeNull()
  })

  it('returns the explanation image url when the question has one', async () => {
    await signInAs(emailA, password)

    // questionIds[2] was updated with explanation_image_url in beforeAll.
    const result = await checkAnswer({
      questionId: questionIds[2],
      selectedOptionId: 'b',
      sessionId: sessionIdA,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.explanationImageUrl).toBe('https://test.local/expl.png')
  })

  it('returns Session not found for a nonexistent session', async () => {
    // Non-vacuous: the success test above proves A's real session resolves.
    await signInAs(emailA, password)

    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Session not found')
  })

  it('returns Session not found for another students session', async () => {
    // Sign in as B and attempt to check against A's session.
    // Non-vacuous: B can successfully check answers in B's own session (see below).
    await signInAs(emailB, password)

    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: sessionIdA,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Session not found')
  })

  it('resolves successfully for the authenticated students own session', async () => {
    // Paired positive for the cross-user isolation test above.
    const { sessionId: bSessionId } = await seedOpenSession({
      studentClient: studentBClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: bSessionId,
    })

    expect(result.success).toBe(true)
  })

  it('returns Question not in session for a question outside the session', async () => {
    // A's session contains questionIds[0..2] only. extraQuestionId was seeded
    // separately and never included in p_question_ids.
    await signInAs(emailA, password)

    const result = await checkAnswer({
      questionId: extraQuestionId,
      selectedOptionId: 'b',
      sessionId: sessionIdA,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Question not in session')
  })

  it('returns Session not found for an ended session', async () => {
    // The action guards .is('ended_at', null). An already-completed session
    // must be rejected — checking an answer in a closed session must not be possible.
    // Non-vacuous: the success test above proves A's active session resolves.
    const { sessionId: endedSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)
    // End the session first.
    await completeQuiz({ sessionId: endedSessionId })

    // Now attempt checkAnswer on the ended session.
    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: endedSessionId,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Session not found')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    // 'nope' is not a valid UUID — Zod will reject at the questionId field.
    const result = await checkAnswer({
      questionId: 'nope',
      selectedOptionId: 'b',
      sessionId: '00000000-0000-0000-0000-000000000001',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await checkAnswer({
      questionId: questionIds[0],
      selectedOptionId: 'b',
      sessionId: '00000000-0000-0000-0000-000000000001',
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
