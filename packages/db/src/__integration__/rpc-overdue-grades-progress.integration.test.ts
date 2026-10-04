import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  backdateSession,
  RIGHT,
  saveAnswer,
  saveAnswers,
  secondsAgo,
  WRONG_MC,
} from './finish-fixture'
import { auditMetadata, sessionRow } from './finish-readers'
import { requireRpcResult } from './guards'
import { insertSession, type ProgressFixture, setupProgressFixture } from './quiz-progress-fixture'

type OverdueResult = {
  session_id: string
  score_percentage: number | string
  passed: boolean
  total_questions: number
  answered_count: number
}

describe('RPC: complete_overdue_exam_session — grades the saved answers', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('overdue')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  async function complete(sessionId: string): Promise<OverdueResult> {
    const { data, error } = await f.student.rpc('complete_overdue_exam_session', {
      p_session_id: sessionId,
    })
    if (error) throw new Error(`complete_overdue_exam_session: ${error.message}`)
    return requireRpcResult<OverdueResult>(data, 'complete_overdue_exam_session')
  }

  /** Exam inside the grace window when answers are saved, then pushed past the deadline. */
  async function overdueSession(mode: 'mock_exam' | 'vfr_rt_exam', questionIds: string[]) {
    const sessionId = await insertSession({
      f,
      mode,
      questionIds,
      timeLimitSeconds: 60,
      startedAt: secondsAgo(10),
    })
    return sessionId
  }

  it('scores a mock exam from its saved answers when it is completed after the deadline', async () => {
    const sessionId = await overdueSession('mock_exam', [mc(0), mc(1)])
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    await backdateSession(f, sessionId, 200)

    const result = await complete(sessionId)

    expect(Number(result.score_percentage)).toBe(50)
    expect(result.passed).toBe(false)
    expect(Number(result.answered_count)).toBe(1)
    const events = await auditMetadata(f, sessionId, 'exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ reason: 'overdue_with_answers', correct_count: 1 })
    expect(Number((await sessionRow(f, sessionId)).score_percentage)).toBe(50)
  })

  it('scores a VFR RT exam per part from its saved answers when it is completed after the deadline', async () => {
    const ids = [f.shortId, f.dialogId, mc(0)]
    const sessionId = await overdueSession('vfr_rt_exam', ids)
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [mc(0), WRONG_MC],
    ])
    await backdateSession(f, sessionId, 2000)

    const result = await complete(sessionId)

    expect(result.passed).toBe(false)
    expect(Number(result.score_percentage)).toBe(66.67)
    const events = await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')
    expect(events).toHaveLength(1)
    expect(Number(events[0]?.part1_pct)).toBe(100)
    expect(Number(events[0]?.part2_pct)).toBe(100)
    expect(Number(events[0]?.part3_pct)).toBe(0)
  })

  it('scores zero and records no answers when nothing was saved before the deadline', async () => {
    const sessionId = await overdueSession('mock_exam', [mc(0), mc(1)])
    await backdateSession(f, sessionId, 200)

    const result = await complete(sessionId)

    expect(Number(result.score_percentage)).toBe(0)
    expect(Number(result.answered_count)).toBe(0)
    const events = await auditMetadata(f, sessionId, 'exam.expired')
    expect(events[0]).toMatchObject({ reason: 'overdue_zero_answers' })
  })

  it('gives partial credit, not a row count, for already-graded rows of a multi-row question', async () => {
    const ids = [f.orderingId, mc(0)]
    const sessionId = await overdueSession('mock_exam', ids)
    const rows = [
      { question_id: f.orderingId, blank_index: 0, response_text: 'first call' },
      { question_id: f.orderingId, blank_index: 1, response_text: 'second call' },
      { question_id: mc(0), selected_option_id: 'a' },
    ].map((r) => ({
      session_id: sessionId,
      response_time_ms: 1000,
      is_correct: r.question_id === f.orderingId,
      ...r,
    }))
    const { error } = await f.admin.from('quiz_session_answers').insert(rows)
    expect(error).toBeNull()
    await backdateSession(f, sessionId, 200)

    const result = await complete(sessionId)

    // one fully right 2-slot ordering + one wrong MC out of 2 questions = 50, not 2 of 3 rows
    expect(Number(result.score_percentage)).toBe(50)
  })

  it('returns the same answered count when an overdue session is completed twice', async () => {
    const ids = [f.orderingId, mc(0)]
    const sessionId = await overdueSession('mock_exam', ids)
    const { error } = await f.admin.from('quiz_session_answers').insert([
      {
        session_id: sessionId,
        question_id: f.orderingId,
        blank_index: 0,
        response_text: 'first call',
        response_time_ms: 1000,
        is_correct: true,
      },
      {
        session_id: sessionId,
        question_id: f.orderingId,
        blank_index: 1,
        response_text: 'second call',
        response_time_ms: 1000,
        is_correct: true,
      },
    ])
    expect(error).toBeNull()
    await backdateSession(f, sessionId, 200)

    const first = await complete(sessionId)
    expect(Number(first.answered_count)).toBe(1)
    const second = await complete(sessionId)

    expect(Number(second.answered_count)).toBe(Number(first.answered_count))
    expect(Number(second.score_percentage)).toBe(Number(first.score_percentage))
  })
})
