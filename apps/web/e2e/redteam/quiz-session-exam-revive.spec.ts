/**
 * Red Team Spec: discarded exam revived by direct UPDATE — Vector GP (soft-delete-bypass)
 *
 * Chain: active mock_exam → student discards it (column grant on deleted_at,
 * students_update_sessions) → start_quiz_session(quick_quiz) with the exam's question_ids →
 * check_quiz_answer returns correct_option_id → practice discarded → exam revived with
 * UPDATE deleted_at = NULL → save_quiz_answer(keyed) → finish_quiz_session grades them.
 * The single-active-session invariant (docs/security.md §11d) stops a practice quiz while the exam
 * is open; the revive step lets the exam leave and re-enter that invariant.
 *
 * Status: BLOCKED — mig 20261003000400 limits students_update_sessions to live rows (deleted_at IS NULL).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { finishSeedSession } from './helpers/finish-session'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_ER_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: discarded exam revive (Vector GP)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: Client
  let orgId: string
  let studentId: string
  let qids: string[]

  const clearActive = () => clearOpenSessions(admin, studentId, 'exam-revive')

  const readExam = async (examId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', examId)
      .single()
    if (error || !data) throw new Error(`readExam: ${error?.message}`)
    return data
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    qids = data.map((r) => r.id as string)
  })

  test.beforeEach(clearActive)

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await clearActive()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_ER_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[exam-revive] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  const seedExam = async (): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        total_questions: qids.length,
        time_limit_seconds: 3600,
        config: { question_ids: qids, e2e_marker: E2E_REDTEAM_ER_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seed exam: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const startPractice = () =>
    student.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: qids,
    })

  // The app's discard path: a direct deleted_at write by the owner.
  const discardOwn = (sessionId: string) =>
    student
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select('id')

  const keyQuestions = async (practiceId: string): Promise<Record<string, string>> => {
    const keys: Record<string, string> = {}
    for (const qid of qids) {
      const r = await student.rpc('check_quiz_answer', {
        p_question_id: qid,
        p_selected_option_id: null,
        p_session_id: practiceId,
      })
      expect(r.error).toBeNull()
      expect(isRecord(r.data) && typeof r.data.correct_option_id === 'string').toBe(true)
      keys[qid] = (r.data as { correct_option_id: string }).correct_option_id
    }
    return keys
  }

  test('a student cannot revive a discarded exam after keying its questions in practice', async () => {
    const examId = await seedExam()

    // Control: the invariant refuses a practice quiz while the exam is open.
    expect((await startPractice()).error?.message).toBe('another_session_active')

    const discard = await discardOwn(examId)
    expect(discard.error).toBeNull()
    expect(discard.data).toHaveLength(1)

    const practice = await startPractice()
    expect(practice.error).toBeNull()
    if (typeof practice.data !== 'string') throw new Error('start practice: no session id')
    const practiceId = practice.data
    await keyQuestions(practiceId)
    expect((await discardOwn(practiceId)).error).toBeNull()

    // The defence that SHOULD hold: the discarded exam stays discarded.
    const revive = await student
      .from('quiz_sessions')
      .update({ deleted_at: null })
      .eq('id', examId)
      .select('id')
    expect(revive.error).toBeNull()
    expect(revive.data).toEqual([])
    expect((await readExam(examId)).deleted_at).not.toBeNull()

    const finish = await finishSeedSession(student, examId)
    expect(finish.data).toBeNull()
    expect(finish.error?.message).toMatch(/session_discarded/)
    expect((await readExam(examId)).ended_at).toBeNull()
  })

  test('a student cannot batch-submit keyed answers to a discarded exam', async () => {
    const examId = await seedExam()
    expect((await discardOwn(examId)).data).toHaveLength(1)
    const deletedAt = (await readExam(examId)).deleted_at
    expect(deletedAt).not.toBeNull()

    const practice = await startPractice()
    expect(practice.error).toBeNull()
    if (typeof practice.data !== 'string') throw new Error('start practice: no session id')
    const practiceId = practice.data
    const keys = await keyQuestions(practiceId)
    expect((await discardOwn(practiceId)).error).toBeNull()

    const keyed = qids.map((qid) => ({
      question_id: qid,
      selected_option: keys[qid],
      response_time_ms: 1000,
    }))
    const submit = await student.rpc('batch_submit_quiz', {
      p_session_id: examId,
      p_answers: keyed,
    })
    expect(submit.data).toBeNull()
    expect(submit.error?.message).toMatch(/session not found or not accessible/)
    const after = await readExam(examId)
    expect(after.ended_at).toBeNull()
    expect(after.deleted_at).toBe(deletedAt)

    // CONTROL: the same keyed answers grade on a live exam.
    const liveId = await seedExam()
    const live = await student.rpc('batch_submit_quiz', { p_session_id: liveId, p_answers: keyed })
    expect(live.error).toBeNull()
    expect((live.data as { correct_count?: number } | null)?.correct_count).toBe(qids.length)
    expect((await readExam(liveId)).ended_at).not.toBeNull()
  })
})
