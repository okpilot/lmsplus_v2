// App-layer integration tier (#925 §7) — getActivePracticeSession.
//
// Exercises the real getActivePracticeSession Server Action against real Postgres
// under real RLS. Validates: active practice session returned for an authenticated
// student, null returned when no session is active, null returned after the
// session is ended, and unauthenticated rejection.
//
// NOTE: This file tests only the app-layer query. The single-active-session guard
// (start_discovery_session + migrations 136-141) is covered at the DB layer in
// packages/db/src/__integration__/rpc-single-active-session.integration.test.ts.
// The `discovery` mode cannot be seeded here until migration 136 (mode CHECK
// widening) is applied locally. Only quick_quiz / smart_review practice sessions
// are seeded.
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
import { getActivePracticeSession } from './get-active-practice-session'
import { startQuizSession } from './start'

const admin = getAdminClient()
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-getprac-a-${suffix}@test.local`
const emailB = `int-getprac-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds

describe('getActivePracticeSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-getprac ${suffix}`,
      slug: `int-getprac-${suffix}`,
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
      subjectCode: `GP_${suffix}`,
      subjectName: `GetPrac Subject ${suffix}`,
      topicCode: `GP_${suffix}_T1`,
      topicName: `GetPrac Topic ${suffix}`,
    })

    await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
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

  it('returns the active practice session with subject details when one is open', async () => {
    await signInAs(emailA, password)

    // Create an open quick_quiz practice session.
    const startResult = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(startResult.success).toBe(true)
    if (!startResult.success) throw new Error(startResult.error)

    const result = await getActivePracticeSession()

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.session).not.toBeNull()
    const session = result.session!
    expect(session.sessionId).toBeTruthy()
    expect(session.mode).toBe('quick_quiz')
    expect(session.subjectId).toBe(refs.subjectId)
    // Subject name and code are joined from easa_subjects via the FK.
    expect(typeof session.subjectName).toBe('string')
    expect(session.subjectName.length).toBeGreaterThan(0)
    expect(typeof session.startedAt).toBe('string')
  })

  it('returns null when the student has no active practice session', async () => {
    // Student B has never started a session — expect null.
    await signInAs(emailB, password)

    const result = await getActivePracticeSession()

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.session).toBeNull()
  })

  it("does not return another student's active session", async () => {
    // Student A has an open session from the first test; student B should not see it.
    await signInAs(emailB, password)

    const result = await getActivePracticeSession()

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.session).toBeNull()
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — cookie jar is empty after the per-test reset.
    const result = await getActivePracticeSession()

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected failure')
    expect(result.error).toBe('Not authenticated')
  })
})
