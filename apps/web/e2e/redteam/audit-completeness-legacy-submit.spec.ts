/**
 * Red Team Spec: the legacy one-shot submit RPCs still write their audit events — Vector HP
 *
 * HP (sibling-guard-gap): batch_submit_quiz and submit_vfr_rt_exam_answers have no app caller
 *     but stay GRANTed to authenticated beside finish_quiz_session. A completion through either must write the same
 *     audit row as the finish path: quiz_session.batch_submitted, exam.completed, exam.expired,
 *     vfr_rt_exam.completed.
 *     CONTROL: the expired arm's within-grace sibling writes exam.completed, not exam.expired.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { backdateSession, expectAuditRow, fetchActiveQuestionIds } from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { buildMcProgressAnswers } from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'
import { buildVfrRtAnswers, cleanupVfrRtPool, seedVfrRtPool } from './helpers/seed-vfr-rt-pool'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

test.describe('Red Team: legacy submit RPC audit completeness (Vector HP)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: Client
  let victim: Client
  let studentId: string
  let victimId: string
  let orgId: string
  let subjectId: string
  let topicId: string
  let pool: Awaited<ReturnType<typeof seedVfrRtPool>>

  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seeded = await seedRedTeamUsers()
    studentId = seeded.attackerUserId
    victimId = seeded.victimUserId
    orgId = seeded.orgId
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId
    await ensureExamConfig(orgId, subjectId, topicId)
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: victimId })
  })

  test.afterEach(async () => {
    await cleanupFixtures(admin, tracker)
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId, pool })
  })

  /** batch_submit_quiz's p_answers shape, one MC answer per pinned question. */
  const batchAnswers = async (sessionId: string) =>
    (await buildMcProgressAnswers(admin, sessionId)).map((a) => ({
      question_id: a.question_id,
      selected_option: a.answer.selected_option_id,
      response_time_ms: 1500,
    }))

  const startExam = async (): Promise<string> => {
    const { data, error } = await student.rpc('start_exam_session', { p_subject_id: subjectId })
    expect(error).toBeNull()
    const sessionId = (data as { session_id?: string } | null)?.session_id
    if (typeof sessionId !== 'string') throw new Error('start_exam_session: no session_id')
    tracker.sessions.add(sessionId)
    return sessionId
  }

  const batchSubmit = async (sessionId: string) =>
    student.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: await batchAnswers(sessionId),
    })

  test('batch_submit_quiz on a quick_quiz writes quiz_session.batch_submitted', async () => {
    const testStart = new Date().toISOString()
    const questionIds = await fetchActiveQuestionIds(admin, { orgId, subjectId, topicId, limit: 1 })
    const { data: sessionId, error: startErr } = await student.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: subjectId,
      p_topic_id: topicId,
      p_question_ids: questionIds,
    })
    expect(startErr).toBeNull()
    if (typeof sessionId !== 'string') throw new Error('start_quiz_session: no session id')
    tracker.sessions.add(sessionId)

    const { error } = await batchSubmit(sessionId)
    expect(error).toBeNull()
    await expectAuditRow(admin, 'quiz_session.batch_submitted', studentId, testStart, sessionId)
  })

  test('batch_submit_quiz on a mock_exam within time writes exam.completed, not exam.expired', async () => {
    const testStart = new Date().toISOString()
    const sessionId = await startExam()

    const { data, error } = await batchSubmit(sessionId)
    expect(error).toBeNull()
    expect((data as { expired?: boolean } | null)?.expired).toBeUndefined()
    await expectAuditRow(admin, 'exam.completed', studentId, testStart, sessionId)
    const { data: expiredRows, error: expiredErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'exam.expired')
      .eq('resource_id', sessionId)
    if (expiredErr) throw new Error(`read exam.expired rows: ${expiredErr.message}`)
    expect(expiredRows).toHaveLength(0)
  })

  test('batch_submit_quiz on a mock_exam past grace writes exam.expired', async () => {
    const testStart = new Date().toISOString()
    const sessionId = await startExam()
    await backdateSession(admin, sessionId)

    const { data, error } = await batchSubmit(sessionId)
    expect(error).toBeNull()
    expect((data as { expired?: boolean } | null)?.expired).toBe(true)
    await expectAuditRow(admin, 'exam.expired', studentId, testStart, sessionId)
  })

  test('submit_vfr_rt_exam_answers within time writes vfr_rt_exam.completed', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const testStart = new Date().toISOString()
    const { data: started, error: startErr } = await victim.rpc('start_vfr_rt_exam_session', {
      p_subject_id: pool.subjectId,
    })
    expect(startErr).toBeNull()
    const sessionId = (started as { session_id?: string } | null)?.session_id
    if (typeof sessionId !== 'string') throw new Error('start_vfr_rt_exam_session: no session_id')
    tracker.sessions.add(sessionId)

    const { data: questions, error: qErr } = await victim.rpc('get_vfr_rt_exam_questions', {
      p_session_id: sessionId,
    })
    expect(qErr).toBeNull()
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error(`get_vfr_rt_exam_questions: ${JSON.stringify(questions)}`)
    }
    const { error } = await victim.rpc('submit_vfr_rt_exam_answers', {
      p_session_id: sessionId,
      p_answers: buildVfrRtAnswers(questions as Array<{ id: string; question_type: string }>),
    })
    expect(error).toBeNull()
    await expectAuditRow(admin, 'vfr_rt_exam.completed', victimId, testStart, sessionId)
  })
})
