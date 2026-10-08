/**
 * Red Team: complete_quiz_session on an exam-mode session (Vector HU).
 *
 * Before mig 20261008000300, complete_quiz_session accepted mock_exam and internal_exam: it
 * ended the session without grading quiz_session_progress, without the saved / device /
 * deadline checks finish_quiz_session runs, left `passed` NULL and wrote
 * `quiz_session.completed` instead of an exam.* / internal_exam.* event.
 *
 * Expected: an exam session is refused (`unsupported_session_mode`) and stays open.
 * CONTROL (same test): finish_quiz_session then grades the saved answers, sets a
 * boolean `passed` and writes the exam completion event.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { expectAuditRow, issueCodeViaRpc } from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import {
  buildMcProgressAnswers,
  finishSeedSession,
  type SeedAnswer,
  saveSeedAnswers,
} from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

type AdminClient = ReturnType<typeof getAdminClient>
type AuthedClient = Awaited<ReturnType<typeof createAuthenticatedClient>>

async function readSession(admin: AdminClient, sessionId: string) {
  const { data, error } = await admin
    .from('quiz_sessions')
    .select('id, ended_at, passed')
    .eq('id', sessionId)
    .single()
  expect(error).toBeNull()
  expect(data?.id).toBe(sessionId)
  return data as { id: string; ended_at: string | null; passed: boolean | null }
}

async function countProgress(admin: AdminClient, sessionId: string): Promise<number> {
  const { count, error } = await admin
    .from('quiz_session_progress')
    .select('question_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  expect(error).toBeNull()
  return count ?? 0
}

async function countEvents(admin: AdminClient, sessionId: string, eventType: string) {
  const { count, error } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('resource_id', sessionId)
    .eq('event_type', eventType)
  expect(error).toBeNull()
  return count ?? 0
}

test.describe('Red Team: complete_quiz_session on exam sessions (HU)', () => {
  let admin: AdminClient
  let student: AuthedClient
  let adminAuthed: AuthedClient
  let studentUserId: string
  let subjectId: string
  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seeded = await seedRedTeamUsers()
    studentUserId = seeded.attackerUserId
    await seedRedTeamAdmin()
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminAuthed = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    const picked = await pickSubjectWithQuestions(admin, { orgId: seeded.orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(seeded.orgId, subjectId, picked.topicId)
  })

  test.afterEach(async () => {
    await cleanupFixtures(admin, tracker)
  })

  /** Attack: complete_quiz_session is refused; CONTROL: finish_quiz_session grades. */
  async function attackThenControl(opts: { sessionId: string; completedEvent: string }) {
    const { sessionId, completedEvent } = opts
    const testStart = new Date().toISOString()
    const answers: SeedAnswer[] = await buildMcProgressAnswers(admin, sessionId)
    await saveSeedAnswers(student, sessionId, answers)
    // Non-vacuous: the session is open and holds saved progress before the attack.
    expect((await readSession(admin, sessionId)).ended_at).toBeNull()
    expect(await countProgress(admin, sessionId)).toBe(answers.length)

    const { data, error } = await student.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(error?.message ?? '').toMatch(/unsupported_session_mode/)
    expect(data ?? null).toBeNull()
    expect((await readSession(admin, sessionId)).ended_at).toBeNull()
    expect(await countEvents(admin, sessionId, 'quiz_session.completed')).toBe(0)

    // CONTROL: the exam completion path grades the saved progress and records a verdict.
    const finish = await finishSeedSession(student, sessionId)
    expect(finish.error).toBeNull()
    const out = finish.data as { answered_count?: number; passed?: unknown }
    expect(out.answered_count).toBe(answers.length)
    expect(typeof out.passed).toBe('boolean')
    const ended = await readSession(admin, sessionId)
    expect(ended.ended_at).not.toBeNull()
    expect(typeof ended.passed).toBe('boolean')
    await expectAuditRow(admin, completedEvent, studentUserId, testStart, sessionId)
  }

  test('HU: an internal exam cannot be closed ungraded through complete_quiz_session', async () => {
    const { code } = await issueCodeViaRpc(adminAuthed, subjectId, studentUserId, tracker.codes)
    const { data, error } = await student.rpc('start_internal_exam_session', { p_code: code })
    expect(error).toBeNull()
    const sessionId = (data as Array<{ session_id?: string }> | null)?.[0]?.session_id
    if (!sessionId) throw new Error('start_internal_exam_session returned no session_id')
    tracker.sessions.add(sessionId)
    await attackThenControl({ sessionId, completedEvent: 'internal_exam.completed' })
  })

  test('HU: a mock exam cannot be closed ungraded through complete_quiz_session', async () => {
    const { data, error } = await student.rpc('start_exam_session', { p_subject_id: subjectId })
    expect(error).toBeNull()
    const sessionId = (data as { session_id?: string } | null)?.session_id
    if (!sessionId) throw new Error('start_exam_session returned no session_id')
    tracker.sessions.add(sessionId)
    await attackThenControl({ sessionId, completedEvent: 'exam.completed' })
  })
})
