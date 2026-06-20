// App-layer integration tier (#925) — batchSubmitQuiz.
//
// Exercises the real batchSubmitQuiz Server Action against real Postgres under
// real RLS. Validates: full submission with score report, cross-user session
// isolation, empty-answers Zod rejection, and unauthenticated rejection.
// Each test that needs an open session calls seedOpenSession inside the test —
// batch_submit_quiz ends the session, so sessions cannot be shared across tests.
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
import { batchSubmitQuiz } from './batch-submit'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-batch-a-${suffix}@test.local`
const emailB = `int-batch-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

describe('batchSubmitQuiz (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-batch ${suffix}`,
      slug: `int-batch-${suffix}`,
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
      subjectCode: `BAT_${suffix}`,
      subjectName: `Batch Subject ${suffix}`,
      topicCode: `BAT_${suffix}_T1`,
      topicName: `Batch Topic ${suffix}`,
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

  it('submits all answers and reports the score', async () => {
    const { sessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    const result = await batchSubmitQuiz({
      sessionId,
      answers: [
        { questionId: questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 },
        { questionId: questionIds[1], selectedOptionId: 'b', responseTimeMs: 1500 },
        { questionId: questionIds[2], selectedOptionId: 'a', responseTimeMs: 1500 },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.totalQuestions).toBe(3)
    expect(result.answeredCount).toBe(3)
    expect(result.correctCount).toBe(2)
    // DB-rounded: 66.66...% or 66.67% depending on rounding.
    expect(result.scorePercentage).toBeCloseTo(66.67, 1)
    expect(result.results).toHaveLength(3)
    // quick_quiz path: the action coalesces passed→null and expired→false.
    // Assert the raw values (no `?? null` here) so a regression that drops the
    // coalescing — leaving passed/expired undefined — fails this assertion.
    expect(result.passed).toBeNull()
    expect(result.expired).toBe(false)
  })

  it('returns a fully populated result for each submitted answer', async () => {
    // The action maps r.question_id→questionId, r.is_correct→isCorrect, etc.
    // toHaveLength alone can't catch a key-rename regression that leaves every
    // field undefined. This test asserts the per-item shape explicitly.
    const { sessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    // 2 correct (questionIds[0,1]) + 1 wrong (questionIds[2]) so we get both
    // isCorrect values in the results array.
    const result = await batchSubmitQuiz({
      sessionId,
      answers: [
        { questionId: questionIds[0], selectedOptionId: 'b', responseTimeMs: 1000 },
        { questionId: questionIds[1], selectedOptionId: 'b', responseTimeMs: 1000 },
        { questionId: questionIds[2], selectedOptionId: 'a', responseTimeMs: 1000 },
      ],
    })

    expect(result.success).toBe(true)
    // Narrows result to the success branch, so result.results is typed below.
    if (!result.success) throw new Error(result.error)
    const { results } = result

    // All three question ids must appear in the results (in any order the RPC returns them).
    const returnedIds = results.map((r) => r.questionId)
    expect(returnedIds).toContain(questionIds[0])
    expect(returnedIds).toContain(questionIds[1])
    expect(returnedIds).toContain(questionIds[2])

    // Per-item shape: every field present with the right type (no `undefined` due to wrong snake_case key).
    for (const r of results) {
      expect(typeof r.questionId).toBe('string')
      expect(typeof r.isCorrect).toBe('boolean')
      expect(typeof r.correctOptionId).toBe('string')
      expect(r.correctOptionId).toBe('b') // seeded correct option
      // explanationText is always a string for seeded questions ('Explanation for question N').
      expect(typeof r.explanationText).toBe('string')
      // explanationImageUrl is null unless we updated the row — none updated here.
      expect(r.explanationImageUrl).toBeNull()
    }
  })

  it('submits to the callers own session successfully', async () => {
    // Paired positive for the cross-user isolation test below: proves B can
    // batch-submit B's own session (the assertion below is non-vacuous).
    const { sessionId: bSessionId } = await seedOpenSession({
      studentClient: studentBClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await batchSubmitQuiz({
      sessionId: bSessionId,
      answers: [{ questionId: questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 }],
    })

    expect(result.success).toBe(true)
  })

  it('fails for another students session', async () => {
    // Seed A's open session. Sign in as B. B must not be able to submit A's session.
    // Non-vacuous: the test above proves B can batch-submit B's own session.
    const { sessionId: aSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await batchSubmitQuiz({
      sessionId: aSessionId,
      answers: [{ questionId: questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('This session could not be found.')
  })

  it('rejects an empty answers array', async () => {
    await signInAs(emailA, password)

    const result = await batchSubmitQuiz({
      sessionId: '00000000-0000-0000-0000-000000000001',
      answers: [],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await batchSubmitQuiz({
      sessionId: '00000000-0000-0000-0000-000000000001',
      answers: [{ questionId: questionIds[0], selectedOptionId: 'b', responseTimeMs: 1500 }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
