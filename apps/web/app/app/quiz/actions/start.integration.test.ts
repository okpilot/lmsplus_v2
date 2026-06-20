// App-layer integration tier (#925) — startQuizSession.
//
// Exercises the real startQuizSession Server Action against real Postgres under
// real RLS. Validates the happy path (session + question ids returned), the
// no-questions-available error, Zod parse rejection, and unauthenticated rejection.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { startQuizSession } from './start'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
const emailA = `int-start-a-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let emptyRefs: ReferenceIds

describe('startQuizSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-start ${suffix}`,
      slug: `int-start-${suffix}`,
    })

    studentAId = await createTestUser({
      admin,
      orgId,
      email: emailA,
      password,
      role: 'student',
    })

    refs = await seedReferenceData({
      admin,
      subjectCode: `ST_${suffix}`,
      subjectName: `Start Subject ${suffix}`,
      topicCode: `ST_${suffix}_T1`,
      topicName: `Start Topic ${suffix}`,
    })

    await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })

    // A second subject with NO seeded questions — exercises the zero-match path.
    emptyRefs = await seedReferenceData({
      admin,
      subjectCode: `ST_EMPTY_${suffix}`,
      subjectName: `Start Empty Subject ${suffix}`,
      topicCode: `ST_EMPTY_${suffix}_T1`,
      topicName: `Start Empty Topic ${suffix}`,
    })
  })

  afterAll(async () => {
    const errors: string[] = []

    try {
      await cleanupTestData({ admin, orgId, userIds: [studentAId] })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs, emptyRefs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('starts a session and returns the session id and question ids', async () => {
    await signInAs(emailA, password)

    const result = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(typeof result.sessionId).toBe('string')
    expect(result.sessionId).toBeTruthy()
    expect(result.questionIds).toHaveLength(3)
  })

  it('returns an error when no questions match the selection', async () => {
    await signInAs(emailA, password)

    const result = await startQuizSession({
      subjectId: emptyRefs.subjectId,
      count: 3,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('No questions available for this selection')
  })

  it('rejects malformed input', async () => {
    await signInAs(emailA, password)

    const result = await startQuizSession({})

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await startQuizSession({
      subjectId: refs.subjectId,
      count: 3,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
