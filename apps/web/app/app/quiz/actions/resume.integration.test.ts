// App-layer integration tier (#925 §7) — resumeQuizSession + the saveDraft
// session-close (#1085).
//
// Exercises the real Server Actions against real Postgres under real RLS. Validates:
//  - Saving a draft PARKS the practice session (soft-deletes the quiz_sessions row),
//    and resuming mints a FRESH active session from the draft's questions.
//  - The save-side soft-delete is scoped to practice modes: a crafted saveDraft citing
//    a graded exam session must NOT abandon it (non-vacuous — a real exam session is
//    seeded and asserted to survive).
//  - Resume of a draft whose question is no longer available fails cleanly and creates
//    no session.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  clearActiveSessions,
  createTestOrg,
  createTestUser,
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
const suffix = Date.now()

let orgId: string
let studentAId: string
let studentBId: string
let questionIds: string[]
const emailA = `int-resume-a-${suffix}@test.local`
const emailB = `int-resume-b-${suffix}@test.local`
const password = 'test-pass-123'
let refs: ReferenceIds

async function latestDraftId(studentId: string): Promise<string> {
  const { data, error } = await admin
    .from('quiz_drafts')
    .select('id')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (error) throw new Error(`latestDraftId: ${error.message}`)
  return data.id
}

describe('resumeQuizSession + saveDraft session-close (app-layer integration)', () => {
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
  // drafts (quiz_drafts is hard-delete-by-design, no deleted_at column) so latestDraftId
  // resolves this test's own draft.
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

  it('parks the session on save and starts a fresh active session on resume', async () => {
    await signInAs(emailA, password)
    const start = await startQuizSession({
      subjectId: refs.subjectId,
      topicIds: [refs.topicId],
      count: 3,
    })
    expect(start.success).toBe(true)
    if (!start.success) throw new Error(start.error)
    const oldSessionId = start.sessionId

    const save = await saveDraft({
      sessionId: oldSessionId,
      questionIds: start.questionIds,
      answers: {},
      currentIndex: 0,
      feedback: {},
    })
    expect(save.success).toBe(true)

    // Save parked the original session (soft-deleted) so it no longer blocks new starts.
    const { data: parked, error: pErr } = await admin
      .from('quiz_sessions')
      .select('deleted_at')
      .eq('id', oldSessionId)
      .single()
    if (pErr) throw new Error(pErr.message)
    expect(parked.deleted_at).not.toBeNull()

    const draftId = await latestDraftId(studentAId)
    const resume = await resumeQuizSession({ draftId })
    expect(resume.success).toBe(true)
    if (!resume.success) throw new Error(resume.error)
    expect(resume.sessionId).not.toBe(oldSessionId)

    // The resumed session is a genuinely active practice session.
    const { data: fresh, error: fErr } = await admin
      .from('quiz_sessions')
      .select('mode, ended_at, deleted_at')
      .eq('id', resume.sessionId)
      .single()
    if (fErr) throw new Error(fErr.message)
    expect(fresh.mode).toBe('quick_quiz')
    expect(fresh.ended_at).toBeNull()
    expect(fresh.deleted_at).toBeNull()

    // The draft now points at the new session id.
    const { data: repointed, error: rErr } = await admin
      .from('quiz_drafts')
      .select('session_config')
      .eq('id', draftId)
      .single()
    if (rErr) throw new Error(rErr.message)
    // Guard the cast (§5): a null JSONB column would throw an opaque TypeError instead
    // of a clean assertion failure on a regression.
    expect(repointed.session_config).not.toBeNull()
    expect((repointed.session_config as { sessionId: string }).sessionId).toBe(resume.sessionId)
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
    const save = await saveDraft({
      sessionId: start.sessionId,
      questionIds: start.questionIds,
      answers: {},
      currentIndex: 0,
      feedback: {},
    })
    expect(save.success).toBe(true)
    const draftId = await latestDraftId(studentAId)

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

    const save = await saveDraft({
      sessionId: exam.id,
      questionIds,
      answers: {},
      currentIndex: 0,
      feedback: {},
    })
    expect(save.success).toBe(true)
    const draftId = await latestDraftId(studentBId)

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
    const save = await saveDraft({
      sessionId: start.sessionId,
      questionIds: start.questionIds,
      answers: {},
      currentIndex: 0,
      feedback: {},
    })
    expect(save.success).toBe(true)
    const draftId = await latestDraftId(studentAId)

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
