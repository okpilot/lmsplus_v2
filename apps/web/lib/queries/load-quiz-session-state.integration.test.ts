// App-layer integration tier (#925) — loadQuizSessionState.
//
// Real get_quiz_progress + quiz_sessions read under real RLS: an open session round-trips what
// save_quiz_answer / save_quiz_position stored, saved / ended / discarded kinds, another
// student's id, viewed-only time, and an exam seed that carries no correctness.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { saveQuizAnswer, saveQuizPosition } from '@/app/app/quiz/actions/quiz-progress'
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
import { loadQuizSessionState } from './load-quiz-session-state'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const ownerEmail = `int-qss-owner-${suffix}@test.local`
const otherEmail = `int-qss-other-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE = '00000000-0000-4000-a000-00000000aaa1'

let orgId: string
let ownerId: string
let otherId: string
let refs: ReferenceIds
let questionIds: string[]
let ownerClient: Awaited<ReturnType<typeof getAuthenticatedClient>>

async function openSession(): Promise<string> {
  const { sessionId } = await seedOpenSession({
    studentClient: ownerClient,
    questionIds,
    subjectId: refs.subjectId,
    topicId: refs.topicId,
  })
  await signInAs(ownerEmail, password)
  return sessionId
}

async function patchSession(sessionId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from('quiz_sessions').update(patch).eq('id', sessionId)
  if (error) throw new Error(`patchSession: ${error.message}`)
}

describe('loadQuizSessionState (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-qss ${suffix}`, slug: `int-qss-${suffix}` })
    ownerId = await createTestUser({ admin, orgId, email: ownerEmail, password, role: 'student' })
    otherId = await createTestUser({ admin, orgId, email: otherEmail, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `QSS_${suffix}`,
      subjectName: `State Subject ${suffix}`,
      topicCode: `QSS_${suffix}_T1`,
      topicName: `State Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: ownerId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    questionIds = seeded.questionIds
    ownerClient = await getAuthenticatedClient({ email: ownerEmail, password })
  })

  afterEach(async () => {
    await clearActiveSessions({ admin, studentIds: [ownerId] })
    await signInAs(ownerEmail, password)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [ownerId, otherId] })
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

  it('round-trips the answers, position, pins and start time a student saved', async () => {
    const sessionId = await openSession()
    const [q0, q1, q2] = questionIds as [string, string, string]
    await saveQuizAnswer({
      sessionId,
      questionId: q0,
      deviceId: DEVICE,
      answer: { selectedOptionId: 'c' },
      timeSpentMs: 1500,
    })
    await saveQuizPosition({
      sessionId,
      deviceId: DEVICE,
      currentIndex: 2,
      pinnedQuestionIds: [q1],
      leaving: { questionId: q1, timeSpentMs: 700 },
    })

    const state = await loadQuizSessionState(sessionId, ownerId)

    expect(state.kind).toBe('open')
    if (state.kind !== 'open') return
    expect(state.mode).toBe('quick_quiz')
    expect(state.questionIds).toEqual(questionIds)
    expect(state.subjectName).toBe(`State Subject ${suffix}`)
    expect(state.startedAt).toEqual(expect.any(String))
    expect(state.seed.currentIndex).toBe(2)
    expect(state.seed.pinnedQuestionIds).toEqual([q1])
    expect(state.seed.answers).toEqual({ [q0]: { selectedOptionId: 'c', responseTimeMs: 1500 } })
    expect(state.seed.answers[q2]).toBeUndefined()
  })

  it('counts a viewed-only question in the active time but not in the answers', async () => {
    const sessionId = await openSession()
    const [q0, q1] = questionIds as [string, string]
    await saveQuizAnswer({
      sessionId,
      questionId: q0,
      deviceId: DEVICE,
      answer: { selectedOptionId: 'a' },
      timeSpentMs: 1000,
    })
    await saveQuizPosition({
      sessionId,
      deviceId: DEVICE,
      currentIndex: 1,
      pinnedQuestionIds: [],
      leaving: { questionId: q1, timeSpentMs: 2500 },
    })

    const state = await loadQuizSessionState(sessionId, ownerId)

    if (state.kind !== 'open') throw new Error(`expected open, got ${state.kind}`)
    expect(state.seed.activeMs).toBe(3500)
    expect(Object.keys(state.seed.answers)).toEqual([q0])
  })

  it('reports a quiz parked for later as saved', async () => {
    const sessionId = await openSession()
    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE })).toEqual({ success: true })

    expect((await loadQuizSessionState(sessionId, ownerId)).kind).toBe('saved')
  })

  it('reports a finished session as ended with its mode', async () => {
    const sessionId = await openSession()
    await patchSession(sessionId, { ended_at: new Date().toISOString() })

    expect(await loadQuizSessionState(sessionId, ownerId)).toEqual({
      kind: 'ended',
      mode: 'quick_quiz',
    })
  })

  it('reports a soft-deleted session as discarded', async () => {
    const sessionId = await openSession()
    await patchSession(sessionId, { deleted_at: new Date().toISOString() })

    expect(await loadQuizSessionState(sessionId, ownerId)).toEqual({ kind: 'discarded' })
  })

  it('reports another student session as not found while the owner still gets it', async () => {
    const sessionId = await openSession()
    expect((await loadQuizSessionState(sessionId, ownerId)).kind).toBe('open')

    await signInAs(otherEmail, password)
    expect(await loadQuizSessionState(sessionId, otherId)).toEqual({ kind: 'not_found' })
  })

  it('reports an id that is not a uuid as not found', async () => {
    expect(await loadQuizSessionState('nope', ownerId)).toEqual({ kind: 'not_found' })
  })

  it('seeds a mock exam with the saved answers and no correctness', async () => {
    const sessionId = await openSession()
    await patchSession(sessionId, { mode: 'mock_exam' })
    await saveQuizAnswer({
      sessionId,
      questionId: questionIds[0],
      deviceId: DEVICE,
      answer: { selectedOptionId: 'b' },
      timeSpentMs: 900,
    })

    const state = await loadQuizSessionState(sessionId, ownerId)

    if (state.kind !== 'open') throw new Error(`expected open, got ${state.kind}`)
    expect(state.mode).toBe('mock_exam')
    expect(Object.keys(state.seed.answers)).toHaveLength(1)
    expect(Object.keys(state.seed).sort()).toEqual([
      'activeMs',
      'answers',
      'currentIndex',
      'pinnedQuestionIds',
    ])
    expect(JSON.stringify(state)).not.toMatch(/isCorrect|correct_option|correctOptionId/)
  })
})
