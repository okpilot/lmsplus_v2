// App-layer integration tier (#925) — saveQuizForLater / resumeSavedQuiz / discardSavedQuiz.
//
// Real Server Actions against real Postgres under real RLS: save parks the same session row,
// resume restores it, the 20-quiz cap, the single-active-session guard, exam refusal, discard,
// and the takeover check that the blocked-start flow (claim → save → start) must clear first.
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
import { claimQuizSession } from './quiz-progress'
import {
  checkSavedQuizRoom,
  discardSavedQuiz,
  resumeSavedQuiz,
  saveQuizForLater,
} from './saved-quiz'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const email = `int-saved-${suffix}@test.local`
const password = 'test-pass-123'
const DEVICE_A = '00000000-0000-4000-a000-00000000aaa1'
const DEVICE_B = '00000000-0000-4000-a000-00000000bbb2'

let orgId: string
let studentId: string
let otherStudentId: string | null = null
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
    .select('saved_at, deleted_at, active_device_id')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`sessionRow: ${error.message}`)
  return data
}

async function insertSavedRows(count: number, owner: string = studentId): Promise<void> {
  const now = new Date().toISOString()
  const rows = Array.from({ length: count }, () => ({
    organization_id: orgId,
    student_id: owner,
    mode: 'quick_quiz',
    config: { question_ids: questionIds },
    total_questions: questionIds.length,
    started_at: now,
    deleted_at: now,
    saved_at: now,
  }))
  const { error } = await admin.from('quiz_sessions').insert(rows)
  if (error) throw new Error(`insertSavedRows: ${error.message}`)
}

describe('saved quiz actions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-saved ${suffix}`, slug: `int-saved-${suffix}` })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SAV_${suffix}`,
      subjectName: `Saved Subject ${suffix}`,
      topicCode: `SAV_${suffix}_T1`,
      topicName: `Saved Topic ${suffix}`,
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
    const errors: string[] = []
    try {
      await clearActiveSessions({ admin, studentIds: [studentId] })
    } catch (e) {
      errors.push(`clearActiveSessions: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('student_id', studentId)
        .not('saved_at', 'is', null)
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`clearSaved: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({
        admin,
        orgId,
        userIds: [studentId, ...(otherStudentId ? [otherStudentId] : [])],
      })
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

  it('parks the open quiz as saved and soft-deleted on the same session id', async () => {
    const sessionId = await openSession()
    expect((await sessionRow(sessionId)).saved_at).toBeNull()

    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })

    const row = await sessionRow(sessionId)
    expect(row.saved_at).not.toBeNull()
    expect(row.deleted_at).not.toBeNull()
    expect(row.active_device_id).toBeNull()
  })

  it('restores the same session on resume and claims it for the resuming device', async () => {
    const sessionId = await openSession()
    await saveQuizForLater({ sessionId, deviceId: DEVICE_A })
    expect((await sessionRow(sessionId)).saved_at).not.toBeNull()

    expect(await resumeSavedQuiz({ sessionId, deviceId: DEVICE_B })).toEqual({ success: true })

    expect(await sessionRow(sessionId)).toEqual({
      saved_at: null,
      deleted_at: null,
      active_device_id: DEVICE_B,
    })
  })

  it('refuses the 21st saved quiz and leaves the session open', async () => {
    await insertSavedRows(20)
    const sessionId = await openSession()

    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/20 saved quizzes/i),
    })
    expect(await sessionRow(sessionId)).toMatchObject({ saved_at: null, deleted_at: null })
  })

  it('reports room for a start at 19 saved quizzes and refuses at 20, leaving a saved quiz untouched', async () => {
    const savedId = await openSession()
    await saveQuizForLater({ sessionId: savedId, deviceId: DEVICE_A })
    await insertSavedRows(18)
    expect(await checkSavedQuizRoom()).toEqual({ success: true })

    await insertSavedRows(1)
    expect(await checkSavedQuizRoom()).toEqual({
      success: false,
      error: expect.stringMatching(/20 saved quizzes/i),
    })
    expect((await sessionRow(savedId)).saved_at).not.toBeNull()
  })

  it("does not count another student's saved quizzes toward the cap", async () => {
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: `int-saved-other-${suffix}@test.local`,
      password,
      role: 'student',
    })
    await insertSavedRows(20, otherStudentId)
    await signInAs(email, password)

    expect(await checkSavedQuizRoom()).toEqual({ success: true })
  })

  it('refuses to resume while another session is open and keeps the quiz saved', async () => {
    const saved = await openSession()
    await saveQuizForLater({ sessionId: saved, deviceId: DEVICE_A })
    const open = await openSession()
    expect((await sessionRow(open)).deleted_at).toBeNull()

    expect(await resumeSavedQuiz({ sessionId: saved, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/active session/i),
    })
    expect((await sessionRow(saved)).saved_at).not.toBeNull()
  })

  it('refuses to resume a session that was never saved', async () => {
    const sessionId = await openSession()

    expect(await resumeSavedQuiz({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/not (in your )?saved/i),
    })
    expect((await sessionRow(sessionId)).deleted_at).toBeNull()
  })

  it('refuses to save a mock exam and leaves it open', async () => {
    const sessionId = await openSession()
    const { error } = await admin
      .from('quiz_sessions')
      .update({ mode: 'mock_exam' })
      .eq('id', sessionId)
    if (error) throw new Error(`mode flip: ${error.message}`)

    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: 'This session type does not support saving progress.',
    })
    expect(await sessionRow(sessionId)).toMatchObject({ saved_at: null, deleted_at: null })
  })

  it('clears the saved marker on discard and keeps the row soft-deleted', async () => {
    const sessionId = await openSession()
    await saveQuizForLater({ sessionId, deviceId: DEVICE_A })
    expect((await sessionRow(sessionId)).saved_at).not.toBeNull()

    expect(await discardSavedQuiz({ sessionId })).toEqual({ success: true })

    const row = await sessionRow(sessionId)
    expect(row.saved_at).toBeNull()
    expect(row.deleted_at).not.toBeNull()
  })

  it('refuses a save from a device that does not hold the session until it claims it', async () => {
    const sessionId = await openSession()
    await claimQuizSession({ sessionId, deviceId: DEVICE_B })
    expect((await sessionRow(sessionId)).active_device_id).toBe(DEVICE_B)

    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE_A })).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
    expect((await sessionRow(sessionId)).saved_at).toBeNull()

    expect(await claimQuizSession({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    expect(await saveQuizForLater({ sessionId, deviceId: DEVICE_A })).toEqual({ success: true })
    expect((await sessionRow(sessionId)).saved_at).not.toBeNull()
  })

  it('rejects malformed input', async () => {
    await signInAs(email, password)
    expect(await saveQuizForLater({ sessionId: 'nope' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
  })
})
