// App-layer integration tier (#925) — finishQuizSession.
//
// Real Server Action against real Postgres under real RLS: finish grades the answers saved
// through saveQuizAnswer, a replay returns success, and another student's session or a
// device that lost the session is refused with the mapped copy.
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
import { finishQuizSession } from './finish'
import { claimQuizSession, saveQuizAnswer } from './quiz-progress'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-finish-${suffix}@test.local`
const otherEmail = `int-finish-other-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE_A = '00000000-0000-4000-a000-00000000aaa1'
const DEVICE_B = '00000000-0000-4000-a000-00000000bbb2'

let orgId: string
let studentId: string
let otherStudentId: string
let refs: ReferenceIds
let questionIds: string[]
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
    .select('ended_at, correct_count')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`sessionRow: ${error.message}`)
  return data
}

describe('finishQuizSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-finish ${suffix}`,
      slug: `int-finish-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: otherEmail,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `FIN_${suffix}`,
      subjectName: `Finish Subject ${suffix}`,
      topicCode: `FIN_${suffix}_T1`,
      topicName: `Finish Topic ${suffix}`,
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
    studentClient = await getAuthenticatedClient({ email, password })
  })

  afterEach(async () => {
    await clearActiveSessions({ admin, studentIds: [studentId] })
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds: [studentId, otherStudentId] })
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

  it('ends the session and grades the saved answers', async () => {
    const sessionId = await openSession()
    expect(await claimQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    // Seeded questions all have correct option 'b'.
    const saved = await saveQuizAnswer({
      sessionId,
      questionId: questionIds[0],
      deviceId: DEVICE_A,
      answer: { selectedOptionId: 'b' },
      timeSpentMs: 1000,
    })
    expect(saved).toEqual({ success: true })
    expect((await sessionRow(sessionId)).ended_at).toBeNull()

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })

    const row = await sessionRow(sessionId)
    expect(row.ended_at).not.toBeNull()
    expect(row.correct_count).toBe(1)
  })

  it('returns success when the session is already finished', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_A })
    expect(await finishQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    const endedAt = (await sessionRow(sessionId)).ended_at
    expect(endedAt).not.toBeNull()

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    expect((await sessionRow(sessionId)).ended_at).toBe(endedAt)
  })

  it("refuses another student's session as not found and leaves it open", async () => {
    const sessionId = await openSession()
    await signInAs(otherEmail, password)

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: 'This session could not be found.',
    })
    expect((await sessionRow(sessionId)).ended_at).toBeNull()
  })

  it('refuses a device that lost the session to another device', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_B })

    expect(await finishQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
    expect((await sessionRow(sessionId)).ended_at).toBeNull()
  })
})
