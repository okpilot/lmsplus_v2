// App-layer integration tier (#925) — quiz-progress Server Actions.
//
// Exercises saveQuizAnswer / saveQuizPosition / claimQuizSession (and checkAnswer's in-RPC
// progress save) against real Postgres under real RLS: claim + save, takeover by another
// device, position + pins + visit time, refusal tokens for non-open sessions, mock_exam,
// Zod rejection and unauthenticated rejection.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
import { checkAnswer } from './check-answer'
import { claimQuizSession, saveQuizAnswer, saveQuizPosition } from './quiz-progress'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-progress-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE_A = '00000000-0000-4000-a000-00000000aaa1'
const DEVICE_B = '00000000-0000-4000-a000-00000000bbb2'
const OUTSIDE_QUESTION = '00000000-0000-4000-a000-0000000000ff'

let orgId: string
let studentId: string
let refs: ReferenceIds
let questionIds: string[]
let outsideQuestionId: string
let studentClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

async function openSession(): Promise<string> {
  const { sessionId } = await seedOpenSession({
    studentClient,
    questionIds,
    subjectId: refs.subjectId,
    topicId: refs.topicId,
  })
  await signInAs(email, password)
  return sessionId
}

async function sessionRow(sessionId: string) {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('active_device_id, current_index, pinned_question_ids')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`sessionRow: ${error.message}`)
  return data
}

async function progressRow(sessionId: string, questionId: string) {
  const { data, error } = await admin
    .from('quiz_session_progress')
    .select('answer, time_spent_ms')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .maybeSingle()
  if (error) throw new Error(`progressRow: ${error.message}`)
  return data
}

function answerFor(sessionId: string, deviceId: string, over: Record<string, unknown> = {}) {
  return {
    sessionId,
    questionId: questionIds[0],
    deviceId,
    answer: { selectedOptionId: 'c' },
    timeSpentMs: 1500,
    ...over,
  }
}

describe('quiz progress actions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-progress ${suffix}`,
      slug: `int-progress-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `PRG_${suffix}`,
      subjectName: `Progress Subject ${suffix}`,
      topicCode: `PRG_${suffix}_T1`,
      topicName: `Progress Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
    const extra = await seedQuestions({
      admin,
      orgId,
      createdBy: studentId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 1,
    })
    const [seededOutside] = extra.questionIds
    if (!seededOutside) throw new Error('beforeAll: no outside-session question was seeded')
    outsideQuestionId = seededOutside
    studentClient = await getAuthenticatedClient({ email, password })
  })

  afterEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId] })
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

  it('stores the claimed device and the saved answer with its visit time', async () => {
    const sessionId = await openSession()
    expect(await claimQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_A))).toEqual({ success: true })

    expect((await sessionRow(sessionId)).active_device_id).toBe(DEVICE_A)
    expect(await progressRow(sessionId, questionIds[0] as string)).toEqual({
      answer: { selected_option_id: 'c' },
      time_spent_ms: 1500,
    })
  })

  it('keeps the first save on a session nobody has claimed yet', async () => {
    const sessionId = await openSession()
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_B))).toEqual({ success: true })
    expect((await sessionRow(sessionId)).active_device_id).toBeNull()
    expect(await progressRow(sessionId, questionIds[0] as string)).toEqual({
      answer: { selected_option_id: 'c' },
      time_spent_ms: 1500,
    })
  })

  it('refuses a save from a device that was taken over and keeps the claimed device data', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_A })
    await saveQuizAnswer(answerFor(sessionId, DEVICE_A))
    await claimQuizSession({ sessionId, deviceId: DEVICE_B })

    const stale = await saveQuizAnswer(
      answerFor(sessionId, DEVICE_A, { answer: { selectedOptionId: 'a' } }),
    )
    expect(stale).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
    expect((await progressRow(sessionId, questionIds[0] as string))?.answer).toEqual({
      selected_option_id: 'c',
    })
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_B))).toEqual({ success: true })
  })

  it('saves position, pins and the visit time of the question being left', async () => {
    const sessionId = await openSession()
    const result = await saveQuizPosition({
      sessionId,
      deviceId: DEVICE_A,
      currentIndex: 2,
      pinnedQuestionIds: [questionIds[1]],
      leaving: { questionId: questionIds[0], timeSpentMs: 4200 },
    })
    expect(result).toEqual({ success: true })

    const row = await sessionRow(sessionId)
    expect(row.current_index).toBe(2)
    expect(row.pinned_question_ids).toEqual([questionIds[1]])
    expect(await progressRow(sessionId, questionIds[0] as string)).toEqual({
      answer: null,
      time_spent_ms: 4200,
    })
  })

  it('refuses a position past the last question', async () => {
    const sessionId = await openSession()
    const result = await saveQuizPosition({
      sessionId,
      deviceId: DEVICE_A,
      currentIndex: 3,
      pinnedQuestionIds: [],
    })
    expect(result).toEqual({ success: false, error: expect.stringMatching(/reload/i) })
  })

  it('refuses a pin for a question outside the session', async () => {
    const sessionId = await openSession()
    const result = await saveQuizPosition({
      sessionId,
      deviceId: DEVICE_A,
      currentIndex: 0,
      pinnedQuestionIds: [outsideQuestionId],
    })
    expect(result).toEqual({ success: false, error: 'That question is not part of this session.' })
  })

  it('refuses an answer for a question outside the session', async () => {
    const sessionId = await openSession()
    const result = await saveQuizAnswer(
      answerFor(sessionId, DEVICE_A, { questionId: outsideQuestionId }),
    )
    expect(result).toEqual({ success: false, error: 'That question is not part of this session.' })
  })

  it('refuses an answer whose type does not match the question', async () => {
    const sessionId = await openSession()
    const result = await saveQuizAnswer(
      answerFor(sessionId, DEVICE_A, { answer: { responseText: 'x' } }),
    )
    expect(result).toEqual({ success: false, error: expect.stringMatching(/could not be saved/i) })
  })

  it('refuses saves on an ended session', async () => {
    const sessionId = await openSession()
    const { data: ended, error: endError } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .select('id')
    expect(endError).toBeNull()
    expect(ended).toHaveLength(1)
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_A))).toEqual({
      success: false,
      error: 'This session has already ended.',
    })
  })

  it('refuses saves on a discarded session', async () => {
    const sessionId = await openSession()
    const { error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) throw new Error(error.message)
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_A))).toEqual({
      success: false,
      error: 'This session was discarded.',
    })
  })

  it('refuses a claim on a quiz that was saved for later', async () => {
    const sessionId = await openSession()
    const { error } = await studentClient.rpc('save_quiz_for_later', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    if (error) throw new Error(`save_quiz_for_later: ${error.message}`)
    expect(await claimQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/saved for later/i),
    })
  })

  it('refuses saves on a discovery session', async () => {
    const { data, error } = await studentClient.rpc('start_discovery_session', {
      p_subject_id: refs.subjectId,
      p_question_ids: questionIds,
    })
    if (error || typeof data !== 'string') throw new Error(`discovery seed: ${error?.message}`)
    await signInAs(email, password)
    expect(await saveQuizAnswer(answerFor(data, DEVICE_A))).toEqual({
      success: false,
      error: 'This session type does not support saving progress.',
    })
  })

  it('saves an answer on a mock exam session', async () => {
    const sessionId = await openSession()
    const { error } = await admin
      .from('quiz_sessions')
      .update({ mode: 'mock_exam' })
      .eq('id', sessionId)
    if (error) throw new Error(`mode flip: ${error.message}`)
    expect(await saveQuizAnswer(answerFor(sessionId, DEVICE_A))).toEqual({ success: true })
    expect((await progressRow(sessionId, questionIds[0] as string))?.answer).toEqual({
      selected_option_id: 'c',
    })
  })

  it('checks an answer from the claimed device and stores it as progress', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_A })
    const result = await checkAnswer({
      questionId: questionIds[1],
      selectedOptionId: 'b',
      sessionId,
      deviceId: DEVICE_A,
      timeSpentMs: 800,
    })
    expect(result).toMatchObject({ success: true, isCorrect: true })
    expect(await progressRow(sessionId, questionIds[1] as string)).toEqual({
      answer: { selected_option_id: 'b' },
      time_spent_ms: 800,
    })
  })

  it('refuses a check from a device that was taken over and returns no grading', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_A })
    await claimQuizSession({ sessionId, deviceId: DEVICE_B })
    const ownerAnswer = { answer: { selected_option_id: 'a' }, time_spent_ms: 1500 }
    expect(
      await saveQuizAnswer(
        answerFor(sessionId, DEVICE_B, {
          questionId: questionIds[1],
          answer: { selectedOptionId: 'a' },
        }),
      ),
    ).toEqual({ success: true })
    expect(await progressRow(sessionId, questionIds[1] as string)).toEqual(ownerAnswer)
    const result = await checkAnswer({
      questionId: questionIds[1],
      selectedOptionId: 'b',
      sessionId,
      deviceId: DEVICE_A,
      timeSpentMs: 800,
    })
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
    expect(await progressRow(sessionId, questionIds[1] as string)).toEqual(ownerAnswer)
  })

  it('rejects malformed input', async () => {
    await signInAs(email, password)
    expect(await saveQuizAnswer({ sessionId: 'nope' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
  })

  it('rejects an unauthenticated caller', async () => {
    expect(await claimQuizSession({ sessionId: OUTSIDE_QUESTION, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: 'Your sign-in has expired. Please sign in again.',
    })
  })
})
