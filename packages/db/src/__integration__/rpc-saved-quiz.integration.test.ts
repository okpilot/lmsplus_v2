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
const CHECK_VIOLATION = '23514'

type Client = ProgressFixture['student']
type SessionState = {
  deleted_at: string | null
  saved_at: string | null
  ended_at: string | null
  active_device_id: string | null
}

describe('RPC: save a quiz for later on the same session id', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('qsaved')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ saved_at: null })
      .eq('organization_id', f.orgId)
      .not('saved_at', 'is', null)
    expect(error).toBeNull()
  })

  const save = (c: Client, id: string, device: string | null = DEVICE_A) =>
    c.rpc('save_quiz_for_later', { p_session_id: id, p_device_id: device })
  const resume = (c: Client, id: string, device: string | null = DEVICE_A) =>
    c.rpc('resume_saved_quiz', { p_session_id: id, p_device_id: device })
  const discard = (c: Client, id: string) => c.rpc('discard_saved_quiz', { p_session_id: id })

  async function state(id: string): Promise<SessionState> {
    const { data, error } = await f.admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at, active_device_id')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    return requireRpcResult<SessionState>(data, 'session state')
  }

  async function answer(id: string, device = DEVICE_A) {
    return f.student.rpc('save_quiz_answer', {
      p_session_id: id,
      p_question_id: f.mcIds[0],
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: device,
    })
  }

  /** Start a practice quiz as student A, claim the device, save one answer, then save it for later. */
  async function savedQuiz(): Promise<string> {
    const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    expect((await answer(id)).error).toBeNull()
    const { error } = await save(f.student, id)
    expect(error).toBeNull()
    return id
  }

  async function insertSavedRows(studentId: string, count: number) {
    const rows = Array.from({ length: count }, () => ({
      organization_id: f.orgId,
      student_id: studentId,
      mode: 'quick_quiz',
      config: { question_ids: f.mcIds.slice(0, 2) },
      total_questions: 2,
      started_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      saved_at: new Date().toISOString(),
    }))
    const { error } = await f.admin.from('quiz_sessions').insert(rows)
    expect(error).toBeNull()
  }

  async function savedCount(studentId: string): Promise<number> {
    const { count, error } = await f.admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .not('saved_at', 'is', null)
    expect(error).toBeNull()
    return count ?? 0
  }

  it('parks the open quiz as soft-deleted and saved, and releases its device', async () => {
    const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    expect((await answer(id)).error).toBeNull()
    const claim = await f.student.rpc('claim_quiz_session', {
      p_session_id: id,
      p_device_id: DEVICE_A,
    })
    expect(claim.error).toBeNull()
    const before = await state(id)
    expect(before).toMatchObject({ deleted_at: null, saved_at: null, active_device_id: DEVICE_A })

    const { error } = await save(f.student, id)
    expect(error).toBeNull()
    const after = await state(id)
    expect(after.deleted_at).not.toBeNull()
    expect(after.saved_at).not.toBeNull()
    expect(after.ended_at).toBeNull()
    expect(after.active_device_id).toBeNull()
    expect(await progressRows(f, id)).toHaveLength(1)
  })

  it('lets a new quiz start while another is saved', async () => {
    const saved = await savedQuiz()
    const next = await startPractice(f, 'smart_review', f.mcIds.slice(0, 2))
    expect(next).not.toBe(saved)
    expect((await state(saved)).saved_at).not.toBeNull()
  })

  it('refuses to resume while another quiz is open and leaves the saved quiz saved', async () => {
    const saved = await savedQuiz()
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    const before = await state(saved)
    expect(before.saved_at).not.toBeNull()

    const { error } = await resume(f.student, saved)
    expect(error?.message).toBe('another_session_active')
    expect(await state(saved)).toEqual(before)
    expect((await state(open)).deleted_at).toBeNull()
  })

  it('reopens the same session id for the resuming device once nothing else is open', async () => {
    const saved = await savedQuiz()
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    const { error: endError } = await f.admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', open)
    expect(endError).toBeNull()

    const { error } = await resume(f.student, saved, DEVICE_B)
    expect(error).toBeNull()
    expect(await state(saved)).toMatchObject({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_B,
    })
    expect(await progressRows(f, saved)).toHaveLength(1)
    expect((await answer(saved, DEVICE_B)).error).toBeNull()
  })

  it('overwrites a stale device on resume with the caller device', async () => {
    const saved = await savedQuiz()
    const { error: staleError } = await f.admin
      .from('quiz_sessions')
      .update({ active_device_id: DEVICE_B })
      .eq('id', saved)
    expect(staleError).toBeNull()
    expect((await state(saved)).active_device_id).toBe(DEVICE_B)

    expect((await resume(f.student, saved, DEVICE_A)).error).toBeNull()
    expect((await state(saved)).active_device_id).toBe(DEVICE_A)
  })

  it('clears an abandoned discovery session so it never blocks a resume', async () => {
    const saved = await savedQuiz()
    const discovery = await insertSession({
      f,
      mode: 'discovery',
      questionIds: f.mcIds.slice(0, 2),
    })
    expect((await state(discovery)).deleted_at).toBeNull()

    expect((await resume(f.student, saved)).error).toBeNull()
    expect((await state(discovery)).deleted_at).not.toBeNull()
    expect((await state(saved)).deleted_at).toBeNull()
  })

  it('refuses answers, position saves, claims and answer checks on a saved quiz', async () => {
    const saved = await savedQuiz()
    const before = await state(saved)
    expect(before.saved_at).not.toBeNull()

    expect((await answer(saved)).error?.message).toBe('session_saved')
    const position = await f.student.rpc('save_quiz_position', {
      p_session_id: saved,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(position.error?.message).toBe('session_saved')
    const claim = await f.student.rpc('claim_quiz_session', {
      p_session_id: saved,
      p_device_id: DEVICE_B,
    })
    expect(claim.error?.message).toBe('session_saved')
    const check = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[1],
      p_selected_option_id: 'b',
      p_session_id: saved,
      p_device_id: DEVICE_A,
      p_time_spent_ms: 500,
    })
    expect(check.error).not.toBeNull()
    expect(await state(saved)).toEqual(before)
    expect(await progressRows(f, saved)).toHaveLength(1)
  })

  it('reports a saved quiz as saved and a discarded one as discarded', async () => {
    const saved = await savedQuiz()
    const { data } = await f.student.rpc('get_quiz_progress', { p_session_id: saved })
    const progress = requireRpcResult<{ status: string; answers: unknown[] }>(data, 'progress')
    expect(progress.status).toBe('saved')
    expect(progress.answers).toHaveLength(1)

    expect((await discard(f.student, saved)).error).toBeNull()
    const after = await f.student.rpc('get_quiz_progress', { p_session_id: saved })
    expect(requireRpcResult<{ status: string }>(after.data, 'progress').status).toBe('discarded')
  })

  it('discarding a saved quiz keeps it soft-deleted and makes it unresumable', async () => {
    const saved = await savedQuiz()
    expect((await state(saved)).saved_at).not.toBeNull()

    expect((await discard(f.student, saved)).error).toBeNull()
    const after = await state(saved)
    expect(after.saved_at).toBeNull()
    expect(after.deleted_at).not.toBeNull()
    expect((await resume(f.student, saved)).error?.message).toBe('session_not_saved')
    expect((await state(saved)).deleted_at).not.toBeNull()
  })

  it('refuses to discard a quiz that is not saved', async () => {
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    expect((await state(open)).saved_at).toBeNull()
    expect((await discard(f.student, open)).error?.message).toBe('session_not_found')
    expect((await state(open)).deleted_at).toBeNull()
  })

  it('refuses the 21st saved quiz and keeps it open', async () => {
    await insertSavedRows(f.studentId, 20)
    expect(await savedCount(f.studentId)).toBe(20)
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))

    expect((await save(f.student, open)).error?.message).toBe('saved_quiz_limit_reached')
    expect((await state(open)).saved_at).toBeNull()
    expect((await state(open)).deleted_at).toBeNull()
    expect(await savedCount(f.studentId)).toBe(20)
  })

  it("does not count another student's saved quizzes against the cap", async () => {
    await insertSavedRows(f.otherStudentId, 20)
    expect(await savedCount(f.otherStudentId)).toBe(20)
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))

    expect((await save(f.student, open)).error).toBeNull()
    expect((await state(open)).saved_at).not.toBeNull()
  })

  it('refuses to save an exam session', async () => {
    const exam = await insertSession({ f, mode: 'mock_exam', questionIds: f.mcIds.slice(0, 2) })
    expect((await state(exam)).deleted_at).toBeNull()
    expect((await save(f.student, exam)).error?.message).toBe('unsupported_session_mode')
    expect(await state(exam)).toMatchObject({ deleted_at: null, saved_at: null })
  })

  it('treats a retried save as a success that leaves the saved row unchanged', async () => {
    const saved = await savedQuiz()
    const before = await state(saved)
    expect(before.saved_at).not.toBeNull()

    expect((await save(f.student, saved)).error).toBeNull()
    expect(await state(saved)).toEqual(before)
  })

  it("hides one student's session from every save, resume and discard call of another", async () => {
    const saved = await savedQuiz()
    const open = await startPractice(f, 'smart_review', f.mcIds.slice(0, 2))
    const savedBefore = await state(saved)
    const openBefore = await state(open)
    expect(savedBefore.saved_at).not.toBeNull()
    expect(openBefore.deleted_at).toBeNull()

    expect((await save(f.other, open)).error?.message).toBe('session_not_found')
    expect((await resume(f.other, saved)).error?.message).toBe('session_not_found')
    expect((await discard(f.other, saved)).error?.message).toBe('session_not_found')
    expect(await state(saved)).toEqual(savedBefore)
    expect(await state(open)).toEqual(openBefore)
  })

  it('refuses a resume without a device', async () => {
    const saved = await savedQuiz()
    expect((await resume(f.student, saved, null)).error?.message).toBe('invalid_device')
    expect((await state(saved)).saved_at).not.toBeNull()
  })

  it('refuses all three calls for a deactivated student', async () => {
    const saved = await savedQuiz()
    const open = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    const { error: offError } = await f.admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.studentId)
    expect(offError).toBeNull()
    try {
      expect((await save(f.student, open)).error?.message).toBe('user_not_found_or_inactive')
      expect((await resume(f.student, saved)).error?.message).toBe('user_not_found_or_inactive')
      expect((await discard(f.student, saved)).error?.message).toBe('user_not_found_or_inactive')
    } finally {
      const { error } = await f.admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', f.studentId)
      expect(error).toBeNull()
    }
    expect((await state(saved)).saved_at).not.toBeNull()
    expect((await state(open)).saved_at).toBeNull()
  })

  it('denies anonymous callers all three calls', async () => {
    const saved = await savedQuiz()
    const anon = getAnonClient()
    const before = await state(saved)
    for (const result of [
      await anon.rpc('save_quiz_for_later', { p_session_id: saved, p_device_id: DEVICE_A }),
      await anon.rpc('resume_saved_quiz', { p_session_id: saved, p_device_id: DEVICE_A }),
      await anon.rpc('discard_saved_quiz', { p_session_id: saved }),
    ]) {
      expect(result.error?.code).toBe('42501')
    }
    expect(await state(saved)).toEqual(before)
  })

  describe('table constraints on saved_at', () => {
    it('rejects a student clearing deleted_at on a saved row', async () => {
      const saved = await savedQuiz()
      const before = await state(saved)
      expect(before.deleted_at).not.toBeNull()

      const { error } = await f.student
        .from('quiz_sessions')
        .update({ deleted_at: null })
        .eq('id', saved)
        .select('id')
      expect(error?.code).toBe(CHECK_VIOLATION)
      expect(await state(saved)).toEqual(before)
    })

    it('rejects saved_at on an exam-mode row', async () => {
      const exam = await insertSession({ f, mode: 'mock_exam', questionIds: f.mcIds.slice(0, 2) })
      const now = new Date().toISOString()
      const { error } = await f.admin
        .from('quiz_sessions')
        .update({ deleted_at: now, saved_at: now })
        .eq('id', exam)
      expect(error?.code).toBe(CHECK_VIOLATION)
      expect(await state(exam)).toMatchObject({ deleted_at: null, saved_at: null })
    })

    it('rejects saved_at on an ended row', async () => {
      const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
      const now = new Date().toISOString()
      const { error: endError } = await f.admin
        .from('quiz_sessions')
        .update({ ended_at: now })
        .eq('id', id)
      expect(endError).toBeNull()
      const { error } = await f.admin
        .from('quiz_sessions')
        .update({ deleted_at: now, saved_at: now })
        .eq('id', id)
      expect(error?.code).toBe(CHECK_VIOLATION)
      expect((await state(id)).saved_at).toBeNull()
    })

    it('rejects saved_at on a row that is not soft-deleted', async () => {
      const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
      const { error } = await f.admin
        .from('quiz_sessions')
        .update({ saved_at: new Date().toISOString() })
        .eq('id', id)
      expect(error?.code).toBe(CHECK_VIOLATION)
      expect(await state(id)).toMatchObject({ deleted_at: null, saved_at: null })
    })
  })
})
