// App-layer integration tier (#925) — submitQuizAnswer.
//
// Exercises the real submitQuizAnswer Server Action against real Postgres under
// real RLS. Validates correct/wrong answer paths, explanation image url field,
// cross-user RLS isolation, Zod parse rejection, and unauthenticated rejection.
// Each test that needs an open session calls seedOpenSession inside the test so
// complete_quiz_session in one test cannot leave another test with an ended session.
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
import { submitQuizAnswer } from './submit'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-submit-a-${suffix}@test.local`
const emailB = `int-submit-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

describe('submitQuizAnswer (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-submit ${suffix}`,
      slug: `int-submit-${suffix}`,
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
      subjectCode: `SUB_${suffix}`,
      subjectName: `Submit Subject ${suffix}`,
      topicCode: `SUB_${suffix}_T1`,
      topicName: `Submit Topic ${suffix}`,
    })

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

    studentAClient = await getAuthenticatedClient({ email: emailA, password })
    studentBClient = await getAuthenticatedClient({ email: emailB, password })
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

  it('returns isCorrect true and the correct option for a right answer', async () => {
    const { sessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    const result = await submitQuizAnswer({
      sessionId,
      questionId: questionIds[0],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe('b')
    expect(result.explanationText).toBeTruthy()
    expect(typeof result.explanationText).toBe('string')
    expect(result.explanationImageUrl).toBeNull()
  })

  it('returns isCorrect false for a wrong answer', async () => {
    const { sessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    const result = await submitQuizAnswer({
      sessionId,
      questionId: questionIds[0],
      selectedOptionId: 'a',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.isCorrect).toBe(false)
    expect(result.correctOptionId).toBe('b')
  })

  it('returns the explanation image url when the question has one', async () => {
    const { sessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    // questionIds[2] was updated with explanation_image_url in beforeAll.
    const result = await submitQuizAnswer({
      sessionId,
      questionId: questionIds[2],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.explanationImageUrl).toBe('https://test.local/expl.png')
  })

  it('submits to the callers own session successfully', async () => {
    // Paired positive for the cross-user isolation test below: proves B can submit
    // B's own session (and the assertion is not vacuous due to an empty pool).
    const { sessionId: bSessionId } = await seedOpenSession({
      studentClient: studentBClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await submitQuizAnswer({
      sessionId: bSessionId,
      questionId: questionIds[0],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(true)
  })

  it('fails when submitting to another students session', async () => {
    // Seed A's session. Sign in as B. B must not be able to submit to A's session.
    // Non-vacuous: the test above proves B can submit to B's own session.
    const { sessionId: aSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await submitQuizAnswer({
      sessionId: aSessionId,
      questionId: questionIds[0],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Failed to submit answer')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    // 'nope' is not a valid UUID — Zod will reject.
    const result = await submitQuizAnswer({
      sessionId: 'nope',
      questionId: questionIds[0],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await submitQuizAnswer({
      sessionId: '00000000-0000-0000-0000-000000000001',
      questionId: questionIds[0],
      selectedOptionId: 'b',
      responseTimeMs: 1500,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
