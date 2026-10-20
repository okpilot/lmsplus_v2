// App-layer integration tier (#925) — startStudy.
//
// Exercises the real startStudy Server Action (one start_discovery RPC) against real Postgres
// under real RLS: answer-key payload, flagged ids, empty pool, single-active-session guard,
// Zod rejection and unauthenticated rejection.
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
import { startStudy } from './study'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let studentId: string
const email = `int-study-${suffix}@test.local`
const password = 'test-pass-123'

let refs: ReferenceIds
let emptyRefs: ReferenceIds
let questionIds: string[]

describe('startStudy (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-study ${suffix}`,
      slug: `int-study-${suffix}`,
    })
    studentId = await createTestUser({ admin, orgId, email, password, role: 'student' })

    refs = await seedReferenceData({
      admin,
      subjectCode: `SS_${suffix}`,
      subjectName: `Study Subject ${suffix}`,
      topicCode: `SS_${suffix}_T1`,
      topicName: `Study Topic ${suffix}`,
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

    // A subject with NO seeded questions — exercises the empty-draw path.
    emptyRefs = await seedReferenceData({
      admin,
      subjectCode: `SS_EMPTY_${suffix}`,
      subjectName: `Study Empty Subject ${suffix}`,
      topicCode: `SS_EMPTY_${suffix}_T1`,
      topicName: `Study Empty Topic ${suffix}`,
    })
  })

  afterEach(async () => {
    const errors: string[] = []

    try {
      await clearActiveSessions({ admin, studentIds: [studentId], label: 'int-study' })
    } catch (e) {
      errors.push(`clearActiveSessions: ${e instanceof Error ? e.message : String(e)}`)
    }

    try {
      const { error } = await admin
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`unflag: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  afterAll(async () => {
    const errors: string[] = []

    // flagged_questions FK-blocks the question/user deletes in cleanupTestData and has no
    // cascade; this fixture hard-deletes only its own flag rows (precedent:
    // packages/db rpc-start-discovery.integration.test.ts).
    try {
      const { error } = await admin.from('flagged_questions').delete().eq('student_id', studentId)
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`flagged_questions: ${e instanceof Error ? e.message : String(e)}`)
    }

    let orgCleaned = false
    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds: [studentId] })
        orgCleaned = true
      } catch (e) {
        errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (orgCleaned) {
      try {
        await cleanupReferenceData({ admin, refs: [refs, emptyRefs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  it('returns the questions with the answer key, the study columns and the session id', async () => {
    await signInAs(email, password)

    // Without a filters key: the action must send p_filters (no DB default) itself.
    const result = await startStudy({ subjectId: refs.subjectId, count: 3 })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.questions).toHaveLength(3)
    expect(result.questions.map((q) => q.id).sort()).toEqual([...questionIds].sort())
    const q = result.questions[0]!
    // DELIBERATE answer-key exposure — Study Mode shows the correct option.
    expect(q.correctOptionId).toBe('b')
    expect(q.questionText.length).toBeGreaterThan(0)
    expect(q.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(q.subjectCode).toBe(`SS_${suffix}`)
    expect(q.topicName).toBe(`Study Topic ${suffix}`)
    expect(result.flaggedIds).toEqual([])

    const { data: row, error } = await admin
      .from('quiz_sessions')
      .select('mode, student_id, ended_at, deleted_at')
      .eq('id', result.sessionId ?? '')
      .single()
    expect(error).toBeNull()
    expect(row).toMatchObject({
      mode: 'discovery',
      student_id: studentId,
      ended_at: null,
      deleted_at: null,
    })
  })

  it('returns the flagged ids among the drawn questions', async () => {
    const flagged = questionIds[0]!
    const { error: flagErr } = await admin
      .from('flagged_questions')
      .insert({ student_id: studentId, question_id: flagged })
    expect(flagErr).toBeNull()
    await signInAs(email, password)

    const result = await startStudy({ subjectId: refs.subjectId, count: 3, filters: ['all'] })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.questions).toHaveLength(3)
    expect(result.flaggedIds).toEqual([flagged])
  })

  it('returns an empty study set and creates no session when nothing matches', async () => {
    await signInAs(email, password)

    const result = await startStudy({ subjectId: emptyRefs.subjectId, count: 3 })

    expect(result).toEqual({ success: true, questions: [], flaggedIds: [] })
    const { data: rows, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('deleted_at', null)
    expect(error).toBeNull()
    expect(rows).toHaveLength(0)
  })

  it('tells the user to finish their active session when a quick quiz is open', async () => {
    const { error: insertErr } = await admin.from('quiz_sessions').insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'quick_quiz',
      subject_id: refs.subjectId,
      config: { question_ids: questionIds },
      total_questions: questionIds.length,
    })
    expect(insertErr).toBeNull()
    await signInAs(email, password)

    const result = await startStudy({ subjectId: refs.subjectId, count: 3 })

    expect(result).toEqual({ success: false, error: 'Finish or exit your active session first.' })
  })

  it('rejects malformed input', async () => {
    await signInAs(email, password)

    const result = await startStudy({})

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('rejects an unauthenticated caller', async () => {
    // No signInAs — the cookie jar is empty after the per-test reset.
    const result = await startStudy({ subjectId: refs.subjectId, count: 3 })

    expect(result).toEqual({ success: false, error: 'Failed to start study session' })
  })
})
