import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'
import { getAnonClient } from './setup'

const DEVICE_A = '11111111-1111-4111-8111-111111111111'
const DEVICE_B = '22222222-2222-4222-8222-222222222222'

describe('RPC: quiz progress — closed sessions, ownership, takeover, privileges', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('qprogg')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const saveAs = (
    client: ProgressFixture['student'],
    sessionId: string,
    questionId: string,
    device: string | null,
  ) =>
    client.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: device,
    })

  async function seedAnswer(sessionId: string) {
    const { error } = await saveAs(f.student, sessionId, f.mcIds[0]!, DEVICE_A)
    expect(error).toBeNull()
    expect(await progressRows(f, sessionId)).toHaveLength(1)
  }

  async function writesAreRefused(sessionId: string, token: string) {
    const answer = await saveAs(f.student, sessionId, f.mcIds[1]!, DEVICE_A)
    expect(answer.error?.message, 'save_quiz_answer').toContain(token)
    const position = await f.student.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(position.error?.message, 'save_quiz_position').toContain(token)
    const claim = await f.student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(claim.error?.message, 'claim_quiz_session').toContain(token)
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.question_id).toBe(f.mcIds[0])
  }

  it('refuses every write on an ended session but still serves the saved progress', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(error).toBeNull()

    await writesAreRefused(sessionId, 'session_ended')
    const { data } = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
    const progress = requireRpcResult<{ status: string; answers: unknown[] }>(data, 'progress')
    expect(progress.status).toBe('ended')
    expect(progress.answers).toHaveLength(1)
  })

  it('refuses every write on a discarded session', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(error).toBeNull()

    await writesAreRefused(sessionId, 'session_discarded')
    const { data } = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(requireRpcResult<{ status: string }>(data, 'progress').status).toBe('discarded')
  })

  it('refuses every write once a timed session is past its limit plus the 30 s grace', async () => {
    const ids = f.mcIds.slice(0, 2)
    const startedAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
    // 75 s elapsed of a 60 s limit: inside the 30 s grace, so writes still land.
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: ids,
      timeLimitSeconds: 60,
      startedAt: startedAgo(75),
    })
    await seedAnswer(sessionId)

    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ started_at: startedAgo(120) })
      .eq('id', sessionId)
    expect(error).toBeNull()
    const refused = await saveAs(f.student, sessionId, f.mcIds[0]!, DEVICE_A)
    expect(refused.error?.message).toContain('session_expired')
    const position = await f.student.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(position.error?.message).toContain('session_expired')
  })

  it('refuses progress writes on a discovery session', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'discovery',
      questionIds: f.mcIds.slice(0, 2),
    })
    const { error } = await saveAs(f.student, sessionId, f.mcIds[0]!, DEVICE_A)
    expect(error?.message).toContain('unsupported_session_mode')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it("refuses another student's session without touching the owner's rows", async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)

    const write = await f.other.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: f.mcIds[0],
      p_answer: { selected_option_id: 'd' },
      p_time_spent_ms: 99_000,
      p_device_id: DEVICE_A,
    })
    expect(write.error?.message).toContain('session_not_found')
    const position = await f.other.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 2,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(position.error?.message).toContain('session_not_found')
    const claim = await f.other.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(claim.error?.message).toContain('session_not_found')
    const read = await f.other.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(read.error?.message).toContain('session_not_found')

    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ answer: { selected_option_id: 'a' }, time_spent_ms: 1000 })
    const { data: session } = await f.admin
      .from('quiz_sessions')
      .select('current_index, active_device_id')
      .eq('id', sessionId)
      .single()
    expect(session).toEqual({ current_index: 0, active_device_id: null })
  })

  it("hides one student's progress rows from another student's direct select", async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)

    const own = await f.student
      .from('quiz_session_progress')
      .select('question_id')
      .eq('session_id', sessionId)
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)
    const others = await f.other
      .from('quiz_session_progress')
      .select('question_id')
      .eq('session_id', sessionId)
    expect(others.error).toBeNull()
    expect(others.data).toEqual([])
  })

  it('refuses a deactivated student', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)
    const { error: deactivateErr } = await f.admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.studentId)
    expect(deactivateErr).toBeNull()
    try {
      const write = await saveAs(f.student, sessionId, f.mcIds[1]!, DEVICE_A)
      expect(write.error?.message).toContain('user_not_found_or_inactive')
      const read = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
      expect(read.error?.message).toContain('user_not_found_or_inactive')
      expect(await progressRows(f, sessionId)).toHaveLength(1)
    } finally {
      const { error } = await f.admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', f.studentId)
      if (error) console.error('[reactivate student]', error.message)
    }
  })

  it('locks out the previous device after a takeover', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)

    const claimA = await f.student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(claimA.error).toBeNull()
    expect((await saveAs(f.student, sessionId, f.mcIds[1]!, DEVICE_A)).error).toBeNull()

    const claimB = await f.student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(claimB.error).toBeNull()

    const before = await progressRows(f, sessionId)
    expect(before).toHaveLength(2)
    expect((await saveAs(f.student, sessionId, f.mcIds[2]!, DEVICE_A)).error?.message).toContain(
      'session_taken_over',
    )
    expect((await saveAs(f.student, sessionId, f.mcIds[2]!, null)).error?.message).toContain(
      'session_taken_over',
    )
    const position = await f.student.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 2,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(position.error?.message).toContain('session_taken_over')
    expect(await progressRows(f, sessionId)).toHaveLength(2)

    expect((await saveAs(f.student, sessionId, f.mcIds[2]!, DEVICE_B)).error).toBeNull()
    const { data } = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(requireRpcResult<{ active_device_id: string }>(data, 'progress').active_device_id).toBe(
      DEVICE_B,
    )
  })

  it('requires a device id to claim a session', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const { error } = await f.student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: null,
    })
    expect(error?.message).toContain('invalid_device')
  })

  it('denies direct writes to the progress table and the new session columns', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await seedAnswer(sessionId)

    const insert = await f.student.from('quiz_session_progress').insert({
      session_id: sessionId,
      question_id: f.mcIds[1],
      student_id: f.studentId,
      answer: { selected_option_id: 'a' },
    })
    expect(insert.error?.code).toBe('42501')
    const update = await f.student
      .from('quiz_session_progress')
      .update({ answer: { selected_option_id: 'd' } })
      .eq('session_id', sessionId)
    expect(update.error?.code).toBe('42501')
    const del = await f.student.from('quiz_session_progress').delete().eq('session_id', sessionId)
    expect(del.error?.code).toBe('42501')
    const sessionUpdate = await f.student
      .from('quiz_sessions')
      .update({ active_device_id: DEVICE_B, current_index: 2 })
      .eq('id', sessionId)
    expect(sessionUpdate.error?.code).toBe('42501')

    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.answer).toEqual({ selected_option_id: 'a' })
  })

  it('denies anonymous callers and every call to the internal helpers', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const anon = getAnonClient()
    const anonSave = await saveAs(anon, sessionId, f.mcIds[0]!, DEVICE_A)
    expect(anonSave.error?.code).toBe('42501')
    const anonRead = await anon.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(anonRead.error?.code).toBe('42501')
    const anonTable = await anon.from('quiz_session_progress').select('question_id')
    expect(anonTable.error?.code).toBe('42501')

    const helper = await f.student.rpc('_save_progress_row', {
      p_session_id: sessionId,
      p_question_id: f.mcIds[0],
      p_student_id: f.studentId,
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1,
      p_device_id: null,
    })
    expect(helper.error?.code).toBe('42501')
    const lock = await f.student.rpc('_lock_session_for_progress', {
      p_session_id: sessionId,
      p_device_id: null,
    })
    expect(lock.error?.code).toBe('42501')
    const validate = await f.student.rpc('_validate_progress_answer', {
      p_answer: { selected_option_id: 'a' },
      p_question_type: 'multiple_choice',
    })
    expect(validate.error?.code).toBe('42501')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })
})
