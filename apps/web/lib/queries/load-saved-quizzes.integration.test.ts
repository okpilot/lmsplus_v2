// App-layer integration tier (#925) — loadSavedQuizzes against real Postgres under real RLS.
//
// Saved rows are soft-deleted by design, so the helper must read past deleted_at. A second
// student's saved quiz must never appear (the explicit student_id predicate, security rule 11).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { claimQuizSession, saveQuizAnswer } from '@/app/app/quiz/actions/quiz-progress'
import { saveQuizForLater } from '@/app/app/quiz/actions/saved-quiz'
import { seedOpenSession } from '@/lib/integration-support/fixtures'
import {
  cleanupReferenceData,
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { loadSavedQuizzes } from './load-saved-quizzes'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const emailA = `int-savedlist-a-${suffix}@test.local`
const emailB = `int-savedlist-b-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE = '00000000-0000-4000-a000-00000000aaa1'

let orgId: string
let studentA: string
let studentB: string
let refs: ReferenceIds
let questionIds: string[]

async function saveOpenQuizFor(email: string, answers: number): Promise<string> {
  const client = await getAuthenticatedClient({ email, password })
  const { sessionId } = await seedOpenSession({
    studentClient: client,
    questionIds,
    subjectId: refs.subjectId,
    topicId: refs.topicId,
  })
  await signInAs(email, password)
  expect(await claimQuizSession({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
  for (const questionId of questionIds.slice(0, answers)) {
    const saved = await saveQuizAnswer({
      sessionId,
      questionId,
      deviceId: DEVICE,
      answer: { selectedOptionId: 'b' },
      timeSpentMs: 1000,
    })
    expect(saved).toEqual({ success: true })
  }
  expect(await saveQuizForLater({ sessionId, deviceId: DEVICE })).toEqual({ success: true })
  return sessionId
}

describe('loadSavedQuizzes (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-savedlist ${suffix}`,
      slug: `int-savedlist-${suffix}`,
    })
    studentA = await createTestUser({ admin, orgId, email: emailA, password, role: 'student' })
    studentB = await createTestUser({ admin, orgId, email: emailB, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SVL_${suffix}`,
      subjectName: `Saved List Subject ${suffix}`,
      topicCode: `SVL_${suffix}_T1`,
      topicName: `Saved List Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentA,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
  })

  afterEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentA, studentB] })
    const { error } = await admin
      .from('quiz_sessions')
      .update({ saved_at: null })
      .in('student_id', [studentA, studentB])
      .not('saved_at', 'is', null)
    if (error) throw new Error(`afterEach clearSaved: ${error.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentA, studentB] })
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

  it('lists the saved quiz with its subject, question count and answered count', async () => {
    const sessionId = await saveOpenQuizFor(emailA, 2)

    const saved = await loadSavedQuizzes(studentA)

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      sessionId,
      mode: 'quick_quiz',
      subjectName: `Saved List Subject ${suffix}`,
      totalCount: 3,
      answeredCount: 2,
    })
  })

  it("does not list another student's saved quiz", async () => {
    const mine = await saveOpenQuizFor(emailA, 1)
    const theirs = await saveOpenQuizFor(emailB, 1)
    await signInAs(emailA, password)

    const saved = await loadSavedQuizzes(studentA)

    expect(saved.map((s) => s.sessionId)).toContain(mine)
    expect(saved.map((s) => s.sessionId)).not.toContain(theirs)
  })

  it('does not list an open quiz that was never saved', async () => {
    const client = await getAuthenticatedClient({ email: emailA, password })
    await seedOpenSession({
      studentClient: client,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)

    expect(await loadSavedQuizzes(studentA)).toEqual([])
  })
})
