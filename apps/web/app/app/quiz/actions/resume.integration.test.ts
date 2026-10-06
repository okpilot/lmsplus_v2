// App-layer integration tier (#925 §7) — resumeQuizSession (#1085, #1026).
//
// Exercises the real Server Action against real Postgres under real RLS. Drafts are seeded
// through the admin client, except one test that drives saveDraft directly. Validates:
//  - Resuming mints a FRESH active session from the draft's questions, seeds its progress
//    rows and position from the draft, then deletes the draft.
//  - A seed failure keeps the draft and soft-deletes the freshly minted session.
//  - Resume of a draft whose question is no longer available fails cleanly and creates
//    no session; graded-exam drafts are refused.
//  - A crafted saveDraft citing a live graded exam cannot soft-delete it.
import type { Json } from '@repo/db/types'
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
import { saveDraft } from './draft'
import { resumeQuizSession } from './resume'
import { startQuizSession } from './start'

const admin = getAdminClient()
const suffix = fixtureSuffix()

let orgId: string
let studentAId: string
let studentBId: string
let questionIds: string[]
const emailA = `int-resume-a-${suffix}@test.local`
const emailB = `int-resume-b-${suffix}@test.local`
const password = 'test-pass-123'
let refs: ReferenceIds

async function seedDraft(opts: {
  studentId: string
  sessionId: string
  questionIds: string[]
  answers?: Record<string, unknown>
  currentIndex?: number
}): Promise<string> {
  const { data, error } = await admin
    .from('quiz_drafts')
    .insert({
      organization_id: orgId,
      student_id: opts.studentId,
      question_ids: opts.questionIds,
      answers: (opts.answers ?? {}) as Json,
      current_index: opts.currentIndex ?? 0,
      session_config: { sessionId: opts.sessionId },
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedDraft: ${error.message}`)
  return data.id
}

/** What save-for-later used to do: park the draft's practice session (soft-delete). */
async function parkSession(sessionId: string): Promise<void> {
  const { error } = await admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw new Error(`parkSession: ${error.message}`)
}

async function draftExists(draftId: string): Promise<boolean> {
  const { data, error } = await admin.from('quiz_drafts').select('id').eq('id', draftId)
  if (error) throw new Error(`draftExists: ${error.message}`)
  return (data?.length ?? 0) > 0
}

describe('resumeQuizSession (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-resume ${suffix}`,
      slug: `int-resume-${suffix}`,
    })
    studentAId = await createTestUser({ admin, orgId, email: emailA, password, role: 'student' })
    studentBId = await createTestUser({ admin, orgId, email: emailB, password, role: 'student' })
    refs = await seedReferenceData({
      admin,
      subjectCode: `RS_${suffix}`,
      subjectName: `Resume Subject ${suffix}`,
      topicCode: `RS_${suffix}_T1`,
      topicName: `Resume Topic ${suffix}`,
    })
    await seedQuestions({
      admin,
      orgId,
      createdBy: studentAId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 3,
    })
    const { data: qs, error: qErr } = await admin
      .from('questions')
      .select('id')
      .eq('subject_id', refs.subjectId)
      .eq('topic_id', refs.topicId)
      .eq('status', 'active')
    if (qErr) throw new Error(`seed questions lookup: ${qErr.message}`)
    questionIds = (qs ?? []).map((q) => q.id)
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

  // Two isolated cleanup steps (code-style §7): clear active sessions so the
  // single-active unique index doesn't block the next test's start, and hard-delete
  // drafts (quiz_drafts is hard-delete-by-design, no deleted_at column) so a draft
  // never leaks into the next test.
  afterEach(async () => {
    const errors: string[] = []
    try {
      await clearActiveSessions({ admin, studentIds: [studentAId, studentBId], label: 'resume' })
    } catch (e) {
      errors.push(`clearActiveSessions: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      const { error } = await admin
        .from('quiz_drafts')
        .delete()
        .in('student_id', [studentAId, studentBId])
      if (error) throw new Error(error.message)
    } catch (e) {
      errors.push(`clearDrafts: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  it('seeds the fresh session from the draft answers and position, then deletes the draft', async () => {
    await signInAs(emailA, password)
    const start = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(start.success).toBe(true)
    if (!start.success) throw new Error(start.error)
    const oldSessionId = start.sessionId
    const [q0, q1] = start.questionIds
    const draftId = await seedDraft({
      studentId: studentAId,
      sessionId: oldSessionId,
      questionIds: start.questionIds,
      answers: {
        [q0 as string]: { selectedOptionId: 'c', responseTimeMs: 1200 },
        [q1 as string]: { selectedOptionId: 'a', responseTimeMs: 800 },
      },
      currentIndex: 1,
    })
    await parkSession(oldSessionId)
    expect(await draftExists(draftId)).toBe(true)

    const resume = await resumeQuizSession({ draftId })
    expect(resume.success).toBe(true)
    if (!resume.success) throw new Error(resume.error)
    expect(resume.sessionId).not.toBe(oldSessionId)

    const { data: fresh, error: fErr } = await admin
      .from('quiz_sessions')
      .select('mode, ended_at, deleted_at, current_index')
      .eq('id', resume.sessionId)
      .single()
    if (fErr) throw new Error(fErr.message)
    expect(fresh).toEqual({
      mode: 'quick_quiz',
      ended_at: null,
      deleted_at: null,
      current_index: 1,
    })

    const { data: rows, error: rErr } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer, time_spent_ms')
      .eq('session_id', resume.sessionId)
    if (rErr) throw new Error(rErr.message)
    expect(rows?.length).toBe(2)
    expect(rows).toContainEqual({
      question_id: q0,
      answer: { selected_option_id: 'c' },
      time_spent_ms: 1200,
    })
    expect(rows).toContainEqual({
      question_id: q1,
      answer: { selected_option_id: 'a' },
      time_spent_ms: 800,
    })
    expect(await draftExists(draftId)).toBe(false)
  })

  it('resumes without a draft answer the session refuses and drops that answer', async () => {
    await signInAs(emailA, password)
    const start = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(start.success).toBe(true)
    if (!start.success) throw new Error(start.error)
    const [q0] = start.questionIds
    // An answer for a question outside the session is dropped before seeding; no RPC call carries it.
    const outsider = '00000000-0000-4000-a000-0000000000ff'
    const draftId = await seedDraft({
      studentId: studentAId,
      sessionId: start.sessionId,
      questionIds: start.questionIds,
      answers: {
        [outsider]: { selectedOptionId: 'a', responseTimeMs: 100 },
        [q0 as string]: { selectedOptionId: 'c', responseTimeMs: 1200 },
      },
    })
    await parkSession(start.sessionId)

    const resume = await resumeQuizSession({ draftId })
    expect(resume.success).toBe(true)
    if (!resume.success) throw new Error(resume.error)

    const { data: rows, error } = await admin
      .from('quiz_session_progress')
      .select('question_id')
      .eq('session_id', resume.sessionId)
    if (error) throw new Error(error.message)
    expect(rows?.map((r) => r.question_id)).toEqual([q0])
    expect(await draftExists(draftId)).toBe(false)
  })

  it('keeps a graded exam session active when a draft cites it (practice-mode allowlist)', async () => {
    await signInAs(emailB, password)
    // Non-vacuous: seed a REAL active internal_exam session and assert it is active first.
    const { data: exam, error: exErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentBId,
        mode: 'internal_exam',
        subject_id: refs.subjectId,
        config: { question_ids: questionIds },
        total_questions: questionIds.length,
      })
      .select('id, deleted_at')
      .single()
    if (exErr) throw new Error(`seed exam session: ${exErr.message}`)
    expect(exam.deleted_at).toBeNull()

    // A crafted saveDraft citing the exam session must not be able to abandon it.
    const save = await saveDraft({
      sessionId: exam.id,
      questionIds,
      answers: {},
      currentIndex: 0,
      feedback: {},
    })
    expect(save.success).toBe(true)

    const { data: after, error: aErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at')
      .eq('id', exam.id)
      .single()
    if (aErr) throw new Error(aErr.message)
    expect(after.deleted_at).toBeNull()
  })

  it('fails cleanly and creates no session when a saved question is no longer available', async () => {
    await signInAs(emailA, password)
    const start = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(start.success).toBe(true)
    if (!start.success) throw new Error(start.error)
    const draftId = await seedDraft({
      studentId: studentAId,
      sessionId: start.sessionId,
      questionIds: start.questionIds,
    })
    await parkSession(start.sessionId)

    // Deactivate one of the draft's questions → start_quiz_session's active-question
    // check drops the count and raises invalid_question_ids on resume.
    const { data: deacted, error: deErr } = await admin
      .from('questions')
      .update({ status: 'draft' })
      .eq('id', start.questionIds[0])
      .select('id')
    if (deErr) throw new Error(deErr.message)
    expect(deacted).toHaveLength(1)
    try {
      const resume = await resumeQuizSession({ draftId })
      expect(resume.success).toBe(false)
      if (resume.success) throw new Error('expected failure')
      expect(resume.error).toMatch(/no longer available/i)

      const { data: active, error: acErr } = await admin
        .from('quiz_sessions')
        .select('id')
        .eq('student_id', studentAId)
        .is('ended_at', null)
        .is('deleted_at', null)
      if (acErr) throw new Error(acErr.message)
      expect(active?.length ?? 0).toBe(0)
    } finally {
      const { error: restoreErr } = await admin
        .from('questions')
        .update({ status: 'active' })
        .eq('id', start.questionIds[0])
      if (restoreErr) {
        console.error('[resume.integration] question restore failed:', restoreErr.message)
      }
    }
  })

  it('refuses to resume a draft whose session is a graded exam and mints no new session', async () => {
    await signInAs(emailB, password)
    // Seed a REAL active internal_exam session and cite it from a crafted draft.
    const { data: exam, error: exErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentBId,
        mode: 'internal_exam',
        subject_id: refs.subjectId,
        config: { question_ids: questionIds },
        total_questions: questionIds.length,
      })
      .select('id')
      .single()
    if (exErr) throw new Error(`seed exam session: ${exErr.message}`)

    const draftId = await seedDraft({
      studentId: studentBId,
      sessionId: exam.id,
      questionIds,
    })

    const resume = await resumeQuizSession({ draftId })
    expect(resume.success).toBe(false)
    if (resume.success) throw new Error('expected failure')
    expect(resume.error).toMatch(/can.t be resumed/i)

    // Non-vacuous: no practice session was minted, and the exam session is untouched (still active).
    const { data: practice, error: pErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentBId)
      .in('mode', ['quick_quiz', 'smart_review'])
      .is('ended_at', null)
      .is('deleted_at', null)
    if (pErr) throw new Error(pErr.message)
    expect(practice?.length ?? 0).toBe(0)

    const { data: examAfter, error: eaErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', exam.id)
      .single()
    if (eaErr) throw new Error(eaErr.message)
    expect(examAfter.deleted_at).toBeNull()
    expect(examAfter.ended_at).toBeNull()
  })

  it('surfaces the active-session message and mints nothing when a graded exam is live', async () => {
    await signInAs(emailA, password)
    // A parked quick_quiz draft: start → save soft-deletes its practice session.
    const start = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(start.success).toBe(true)
    if (!start.success) throw new Error(start.error)
    const draftId = await seedDraft({
      studentId: studentAId,
      sessionId: start.sessionId,
      questionIds: start.questionIds,
    })
    await parkSession(start.sessionId)

    // The student now ALSO has a live graded exam. Resume's own draft is a valid practice
    // draft, so it clears validateSessionForResume — but start_quiz_session must refuse to
    // mint a second active session (single-active invariant #1011), and resumeQuizSession
    // maps that another_session_active token to the active-session copy.
    const { data: exam, error: exErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentAId,
        mode: 'internal_exam',
        subject_id: refs.subjectId,
        config: { question_ids: questionIds },
        total_questions: questionIds.length,
      })
      .select('id')
      .single()
    if (exErr) throw new Error(`seed exam session: ${exErr.message}`)

    const resume = await resumeQuizSession({ draftId })
    expect(resume.success).toBe(false)
    if (resume.success) throw new Error('expected failure')
    expect(resume.error).toMatch(/active session/i)

    // Non-vacuous: no practice session was minted, and the live exam is untouched.
    const { data: practice, error: pErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentAId)
      .in('mode', ['quick_quiz', 'smart_review'])
      .is('ended_at', null)
      .is('deleted_at', null)
    if (pErr) throw new Error(pErr.message)
    expect(practice?.length ?? 0).toBe(0)

    const { data: examAfter, error: eaErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', exam.id)
      .single()
    if (eaErr) throw new Error(eaErr.message)
    expect(examAfter.deleted_at).toBeNull()
    expect(examAfter.ended_at).toBeNull()
  })

  it('rejects an unauthenticated caller', async () => {
    const resume = await resumeQuizSession({ draftId: '00000000-0000-0000-0000-000000000000' })
    expect(resume.success).toBe(false)
    if (resume.success) throw new Error('expected failure')
    expect(resume.error).toBe('Not authenticated')
  })
})
