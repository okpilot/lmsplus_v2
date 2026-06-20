// App-layer integration tier (#925) — completeQuiz.
//
// Exercises the real completeQuiz Server Action against real Postgres under real
// RLS. The lifecycle test is the key §7 test: it exercises the full
// startQuizSession → submitQuizAnswer × 3 → completeQuiz flow through the
// action layer, without any fixture helpers, so cross-action contract breaks
// surface here (not only in unit tests). Also validates nonexistent-session,
// cross-user isolation, Zod rejection, and unauthenticated rejection.
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
import { completeQuiz } from './complete'
import { startQuizSession } from './start'
import { submitQuizAnswer } from './submit'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-complete-a-${suffix}@test.local`
const emailB = `int-complete-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

describe('completeQuiz (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-complete ${suffix}`,
      slug: `int-complete-${suffix}`,
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
      subjectCode: `CMP_${suffix}`,
      subjectName: `Complete Subject ${suffix}`,
      topicCode: `CMP_${suffix}_T1`,
      topicName: `Complete Topic ${suffix}`,
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
    // studentBClient is not needed here — B's isolation test uses signInAs(emailB) only.
    await getAuthenticatedClient({ email: emailB, password })
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

  it('completes a started session and reports a score reflecting the answers', async () => {
    // Full lifecycle through the action layer: start → submit × 3 → complete.
    // 2 correct ('b') + 1 wrong ('a') → 66.67% score.
    await signInAs(emailA, password)

    const started = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(started.success).toBe(true)
    if (!started.success) throw new Error(started.error)

    // Submit 2 correct then 1 wrong — each must succeed before completing.
    for (let i = 0; i < 3; i++) {
      const submitResult = await submitQuizAnswer({
        sessionId: started.sessionId,
        questionId: started.questionIds[i],
        selectedOptionId: i < 2 ? 'b' : 'a',
        responseTimeMs: 1500,
      })
      expect(submitResult.success).toBe(true)
    }

    const result = await completeQuiz({ sessionId: started.sessionId })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.totalQuestions).toBe(3)
    expect(result.correctCount).toBe(2)
    // DB-rounded: 66.66...% or 66.67% depending on rounding. toBeCloseTo(66.67,1) tolerates ±0.05.
    expect(result.scorePercentage).toBeCloseTo(66.67, 1)
  })

  it('fails to complete a nonexistent session', async () => {
    await signInAs(emailA, password)

    const result = await completeQuiz({ sessionId: '00000000-0000-0000-0000-000000000000' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Failed to complete session')
  })

  it('fails to complete another students session', async () => {
    // Seed A's open session. Sign in as B. B must not be able to complete A's session.
    // Non-vacuous: the lifecycle test above proves a real owned session completes successfully.
    const { sessionId: aSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
    })
    await signInAs(emailB, password)

    const result = await completeQuiz({ sessionId: aSessionId })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Failed to complete session')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    const result = await completeQuiz({})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await completeQuiz({ sessionId: '00000000-0000-0000-0000-000000000001' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
