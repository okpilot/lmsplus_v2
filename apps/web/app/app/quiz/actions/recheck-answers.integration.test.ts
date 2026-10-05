// App-layer integration tier (#925) — recheckRestoredAnswers.
//
// Real Server Action against real Postgres under real RLS: grades restored answers of the
// caller's own session, refuses foreign / ended sessions, leaves nothing for a stranger.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
import { recheckRestoredAnswers } from './recheck-answers'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let studentAId: string
let studentBId: string
const emailA = `int-recheck-a-${suffix}@test.local`
const emailB = `int-recheck-b-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let questionIds: string[]
let extraQuestionId: string

let studentAClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

// Open session for A seeded in beforeAll for tests that share one without
// mutating it (checkAnswer does not end the session — only complete/batch-submit do).
let sessionIdA: string

describe('recheckRestoredAnswers (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-recheck ${suffix}`,
      slug: `int-recheck-${suffix}`,
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
      subjectCode: `RCK_${suffix}`,
      subjectName: `Check Subject ${suffix}`,
      topicCode: `RCK_${suffix}_T1`,
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

  const DEVICE_ID = '00000000-0000-4000-a000-0000000000d1'

  async function readProgress(sessionId: string) {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer, updated_at')
      .eq('session_id', sessionId)
      .order('question_id')
    if (error) throw new Error(`read progress: ${error.message}`)
    return data ?? []
  }

  it('grades every restored answer of the callers own session and reveals the key', async () => {
    const [q0, q1] = questionIds
    if (!q0 || !q1) throw new Error('seedQuestions returned fewer than 2 ids')
    await signInAs(emailA, password)

    const result = await recheckRestoredAnswers({
      sessionId: sessionIdA,
      deviceId: DEVICE_ID,
      answers: [
        { questionId: q0, selectedOptionId: 'b' },
        { questionId: q1, selectedOptionId: 'a' },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(Object.keys(result.feedback).sort()).toEqual([q0, q1].sort())
    expect(result.feedback[q0]).toMatchObject({ isCorrect: true, correctOptionId: 'b' })
    expect(result.feedback[q1]).toMatchObject({
      isCorrect: false,
      correctOptionId: 'b',
    })
  })

  it('grades nothing for another students session', async () => {
    const q0 = questionIds[0]
    if (!q0) throw new Error('seedQuestions returned no id')
    const answers = [{ questionId: q0, selectedOptionId: 'c' }]
    await signInAs(emailA, password)
    const own = await recheckRestoredAnswers({
      sessionId: sessionIdA,
      deviceId: DEVICE_ID,
      answers,
    })
    if (!own.success) throw new Error(own.error)
    expect(own.feedback[q0]).toBeDefined()
    const before = await readProgress(sessionIdA)
    expect(before.length).toBeGreaterThan(0)

    await signInAs(emailB, password)
    const result = await recheckRestoredAnswers({
      sessionId: sessionIdA,
      deviceId: DEVICE_ID,
      answers: [{ questionId: q0, selectedOptionId: 'b' }],
    })

    expect(result).toEqual({ success: true, feedback: {}, done: true })
    expect(await readProgress(sessionIdA)).toEqual(before)
  })

  it('drops an answer for a question outside the session', async () => {
    await signInAs(emailA, password)

    const result = await recheckRestoredAnswers({
      sessionId: sessionIdA,
      deviceId: DEVICE_ID,
      answers: [
        { questionId: extraQuestionId, selectedOptionId: 'b' },
        { questionId: questionIds[2], selectedOptionId: 'b' },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(Object.keys(result.feedback)).toEqual([questionIds[2]])
  })

  it('rejects input that does not parse', async () => {
    await signInAs(emailA, password)

    const result = await recheckRestoredAnswers({ sessionId: sessionIdA, answers: [] })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('grades nothing once the session has ended', async () => {
    await clearActiveSessions({ admin, studentIds: [studentAId] })
    const { sessionId: endedSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)
    const answers = [{ questionId: questionIds[0], selectedOptionId: 'b' }]
    const open = await recheckRestoredAnswers({
      sessionId: endedSessionId,
      deviceId: DEVICE_ID,
      answers,
    })
    if (!open.success) throw new Error(open.error)
    expect(Object.keys(open.feedback)).toEqual([questionIds[0]])
    const { error: endErr } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', endedSessionId)
    if (endErr) throw new Error(`end session: ${endErr.message}`)

    const result = await recheckRestoredAnswers({
      sessionId: endedSessionId,
      deviceId: DEVICE_ID,
      answers: [{ questionId: questionIds[0], selectedOptionId: 'b' }],
    })

    expect(result).toEqual({ success: true, feedback: {}, done: true })
  })

  it('grades nothing once the session is soft-deleted', async () => {
    await clearActiveSessions({ admin, studentIds: [studentAId] })
    const { sessionId: deletedSessionId } = await seedOpenSession({
      studentClient: studentAClient,
      questionIds,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
    })
    await signInAs(emailA, password)
    const answers = [{ questionId: questionIds[0], selectedOptionId: 'b' }]
    const open = await recheckRestoredAnswers({
      sessionId: deletedSessionId,
      deviceId: DEVICE_ID,
      answers,
    })
    if (!open.success) throw new Error(open.error)
    expect(Object.keys(open.feedback)).toEqual([questionIds[0]])
    const { error: delErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedSessionId)
    if (delErr) throw new Error(`soft-delete session: ${delErr.message}`)

    const result = await recheckRestoredAnswers({
      sessionId: deletedSessionId,
      deviceId: DEVICE_ID,
      answers,
    })

    expect(result).toEqual({ success: true, feedback: {}, done: true })
  })
})
