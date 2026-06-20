// App-layer integration tier (#925) — getProgressData.
//
// Exercises the real getProgressData helper chain (easa_subjects SELECT,
// easa_topics SELECT, get_student_mastery_stats RPC) against real Postgres
// under real RLS. Mocked unit tests cannot catch missing deleted_at columns
// or RLS self-scoping bugs; this tier can.
//
// INVARIANT: no other questions may exist in this org — mastery `total` is
// the count of org-wide active questions; extra rows would inflate it and
// break the exact-count assertions.
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
import { getProgressData } from '@/lib/queries/progress'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-prog-a-${suffix}@test.local`
const emailB = `int-prog-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>
let studentBClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

describe('getProgressData (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-prog ${suffix}`,
      slug: `int-prog-${suffix}`,
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
      subjectCode: `PR_${suffix}`,
      subjectName: `Progress Subject ${suffix}`,
      topicCode: `PR_${suffix}_T1`,
      topicName: `Progress Topic ${suffix}`,
    })

    // Exactly 3 questions — mastery total must equal 3 for the assertions below.
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

    // Student A: 2 of 3 correct (first 2 'b', last 'a').
    await seedCompletedSession({
      studentClient: studentAClient,
      questionIds,
      correctCount: 2,
      totalCount: 3,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })

    // Student B: all 3 correct (pinned at 3, distinct from A's 2).
    await seedCompletedSession({
      studentClient: studentBClient,
      questionIds,
      correctCount: 3,
      totalCount: 3,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
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

  it('returns subject mastery counts for the authenticated student', async () => {
    await signInAs(emailA, password)

    const data = await getProgressData()

    const subject = data.find((s) => s.id === refs.subjectId)
    expect(subject).toBeDefined()
    expect(subject?.totalQuestions).toBe(3)
    expect(subject?.answeredCorrectly).toBe(2)
    expect(subject?.masteryPercentage).toBe(67)
  })

  it('returns topic mastery counts for the authenticated student', async () => {
    await signInAs(emailA, password)

    const data = await getProgressData()

    const subject = data.find((s) => s.id === refs.subjectId)
    const topic = subject?.topics.find((t) => t.id === refs.topicId)
    expect(topic).toBeDefined()
    expect(topic?.totalQuestions).toBe(3)
    expect(topic?.answeredCorrectly).toBe(2)
    expect(topic?.masteryPercentage).toBe(67)
  })

  it('self-scopes to the authenticated student and does not include other students answers', async () => {
    // Non-vacuous: B answered all 3 correctly (correctCount=3). If RLS leaks
    // B's answers into A's view, answeredCorrectly would be > 2 (or equal to
    // B's count). Asserting === 2 proves the self-scope is working.
    await signInAs(emailA, password)

    const data = await getProgressData()

    const subject = data.find((s) => s.id === refs.subjectId)
    expect(subject).toBeDefined()
    // A answered 2 correctly. B answered 3. Cross-contamination would show 3 or more.
    expect(subject?.answeredCorrectly).toBe(2)
    // Also not 5 (sum of both) — just A's own 2.
    expect(subject?.answeredCorrectly).not.toBe(5)
  })
})
