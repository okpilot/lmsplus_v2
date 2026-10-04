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

  /** Drops `question_ids` from the session's config so the question list is unusable. */
  async function dropQuestionList(sessionId: string) {
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ config: { pass_mark: 75 } })
      .eq('id', sessionId)
    if (error) throw new Error(`dropQuestionList: ${error.message}`)
    const { data, error: readErr } = await f.admin
      .from('quiz_sessions')
      .select('config')
      .eq('id', sessionId)
      .single()
    if (readErr) throw new Error(`dropQuestionList read: ${readErr.message}`)
    const config = requireRpcResult<{ config: Record<string, unknown> }>(data, 'config read').config
    expect('question_ids' in config).toBe(false)
  }

  it('completes an overdue exam whose config has no question list with score zero instead of failing', async () => {
    const sessionId = await overdueSession('mock_exam', [mc(0), mc(1)])
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    await dropQuestionList(sessionId)
    await backdateSession(f, sessionId, 200)

    const result = await complete(sessionId)

    expect(Number(result.score_percentage)).toBe(0)
    expect(result.passed).toBe(false)
    expect(Number(result.answered_count)).toBe(0)
    const stored = await sessionRow(f, sessionId)
    expect(stored.ended_at).not.toBeNull()
    expect(Number(stored.score_percentage)).toBe(0)
    const events = await auditMetadata(f, sessionId, 'exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]?.reason).toBe('overdue_config_unusable')
  })

  it('completes an overdue VFR RT exam whose config has no question list and records zero parts', async () => {
    const sessionId = await overdueSession('vfr_rt_exam', [f.shortId, f.dialogId, mc(0)])
    await dropQuestionList(sessionId)
    await backdateSession(f, sessionId, 2000)

    const result = await complete(sessionId)

    expect(result.passed).toBe(false)
    expect(Number(result.score_percentage)).toBe(0)
    expect((await sessionRow(f, sessionId)).ended_at).not.toBeNull()
    const events = await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]?.reason).toBe('overdue_config_unusable')
    expect([events[0]?.part1_pct, events[0]?.part2_pct, events[0]?.part3_pct].map(Number)).toEqual([
      0, 0, 0,
    ])
  })

  it('lets the student start a new exam after an overdue exam whose config has no question list', async () => {
    const { data: base, error: baseErr } = await f.admin
      .from('questions')
      .select('subject_id, topic_id')
      .eq('id', f.shortId)
      .single()
    if (baseErr) throw new Error(`base question: ${baseErr.message}`)
    const { subject_id: subjectId, topic_id: topicId } = requireRpcResult<{
      subject_id: string
      topic_id: string
    }>(base, 'base question')
    const { data: cfg, error: cfgErr } = await f.admin
      .from('exam_configs')
      .insert({
        organization_id: f.orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr) throw new Error(`exam_configs: ${cfgErr.message}`)
    const { error: distErr } = await f.admin.from('exam_config_distributions').insert({
      exam_config_id: requireRpcResult<{ id: string }>(cfg, 'exam_configs').id,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distErr) throw new Error(`exam_config_distributions: ${distErr.message}`)
    const oldId = await overdueSession('mock_exam', [mc(0), mc(1)])
    const { error: subjErr } = await f.admin
      .from('quiz_sessions')
      .update({ subject_id: subjectId })
      .eq('id', oldId)
    if (subjErr) throw new Error(`set subject: ${subjErr.message}`)
    await dropQuestionList(oldId)
    await backdateSession(f, oldId, 200)

    const { data, error } = await f.student.rpc('start_exam_session', { p_subject_id: subjectId })

    expect(error).toBeNull()
    const started = requireRpcResult<{ session_id: string }>(data, 'start_exam_session')
    expect(started.session_id).not.toBe(oldId)
    expect((await sessionRow(f, oldId)).ended_at).not.toBeNull()
  })
})
