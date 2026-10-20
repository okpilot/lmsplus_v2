// App-layer integration tier (#925) — startQuizSession.
//
// Exercises the real startQuizSession Server Action (one start_practice_quiz RPC) against real
// Postgres under real RLS: happy path, topic storage, blocked second start, the
// no-questions-available error, Zod parse rejection, and unauthenticated rejection.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedQuestions,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { startQuizSession } from './start'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let studentAId: string
const emailA = `int-start-a-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let emptyRefs: ReferenceIds
let mixedRefs: ReferenceIds

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

    // A second topic (+ subtopic) on the SAME subject: a topic+subtopic draw can then fall
    // outside the single requested topic.
    mixedRefs = await seedReferenceData({
      admin,
      subjectCode: `ST_${suffix}`,
      subjectName: `Start Subject ${suffix}`,
      topicCode: `ST_${suffix}_T2`,
      topicName: `Start Topic Two ${suffix}`,
      subtopicCode: `ST_${suffix}_T2_S1`,
      subtopicName: `Start Subtopic ${suffix}`,
    })

    await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: mixedRefs.subjectId,
      topicId: mixedRefs.topicId,
      subtopicId: mixedRefs.subtopicId,
      count: 2,
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
        await cleanupReferenceData({ admin, refs: [refs, mixedRefs, emptyRefs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  afterEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentAId], label: 'int-start' })
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

  it('stores the topic on the session when the whole draw sits in the single requested topic', async () => {
    await signInAs(emailA, password)

    const result = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    const { data: row, error } = await admin
      .from('quiz_sessions')
      .select('mode, topic_id, total_questions')
      .eq('id', result.sessionId)
      .single()
    expect(error).toBeNull()
    expect(row).toMatchObject({
      mode: 'quick_quiz',
      topic_id: refs.topicId,
      total_questions: 3,
    })
  })

  it('stores no topic when a topic and subtopic selection draws beyond the topic', async () => {
    await signInAs(emailA, password)

    const result = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      subtopicIds: mixedRefs.subtopicId ? [mixedRefs.subtopicId] : [],
      count: 500,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    // Non-vacuous: the draw really spans both topics (3 + 2 seeded questions).
    expect(result.questionIds).toHaveLength(5)
    const { data: row, error } = await admin
      .from('quiz_sessions')
      .select('topic_id')
      .eq('id', result.sessionId)
      .single()
    expect(error).toBeNull()
    expect(row?.topic_id).toBeNull()
  })

  it('blocks a second start while the first session is still active', async () => {
    await signInAs(emailA, password)
    const first = await startQuizSession({ subjectId: refs.subjectId, count: 3 })
    expect(first.success).toBe(true)

    const second = await startQuizSession({ subjectId: refs.subjectId, count: 3 })

    expect(second.success).toBe(false)
    if (second.success) throw new Error('expected failure')
    expect(second).toMatchObject({ blocked: true })
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
