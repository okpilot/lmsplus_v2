import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  backdateSession,
  type FinishResult,
  finishSeedSession,
  RIGHT,
  saveAnswers,
  WRONG_MC,
} from './finish-fixture'
import { answerRows, auditMetadata, responseCount } from './finish-readers'
import { requireRpcResult } from './guards'
import { insertSession, type ProgressFixture, setupProgressFixture } from './quiz-progress-fixture'

function scalars(r: FinishResult) {
  return {
    expired: r.expired,
    total: r.total_questions,
    answered: Number(r.answered_count),
    correct: Number(r.correct_count),
    score: Number(r.score_percentage),
    passed: r.passed,
    part1: r.part1_pct === undefined ? undefined : Number(r.part1_pct),
    part2: r.part2_pct === undefined ? undefined : Number(r.part2_pct),
    part3: r.part3_pct === undefined ? undefined : Number(r.part3_pct),
    passedOverall: r.passed_overall,
  }
}

/** results is jsonb_agg without ORDER BY — compare it order-insensitively. */
function resultsByQuestion(r: FinishResult) {
  return [...r.results]
    .map((row) => requireRpcResult<Record<string, unknown>>(row, 'results row'))
    .sort((a, b) => String(a.question_id).localeCompare(String(b.question_id)))
}

describe('RPC: finish_quiz_session — expired sessions', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('finishx')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  it('returns the same expired result on a second finish of a mock exam and writes nothing new', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: [mc(0), mc(1)],
      timeLimitSeconds: 60,
    })
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [mc(1), WRONG_MC],
    ])
    await backdateSession(f, sessionId, 200)
    const first = await finishSeedSession(f.student, sessionId)
    expect(first.expired).toBe(true)
    expect(first.results).toHaveLength(2)
    expect(await answerRows(f, sessionId)).toHaveLength(2)
    expect(await auditMetadata(f, sessionId, 'exam.expired')).toHaveLength(1)

    const second = await finishSeedSession(f.student, sessionId)

    expect(scalars(second)).toEqual(scalars(first))
    expect(resultsByQuestion(second)).toEqual(resultsByQuestion(first))
    expect(await answerRows(f, sessionId)).toHaveLength(2)
    expect(await responseCount(f, sessionId)).toBe(2)
    expect(await auditMetadata(f, sessionId, 'exam.expired')).toHaveLength(1)
    expect(await auditMetadata(f, sessionId, 'exam.completed')).toHaveLength(0)
  })

  it('grades a VFR RT exam finished past its deadline per part and flags it expired, again on a second finish', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: [f.shortId, f.dialogId, mc(0)],
      timeLimitSeconds: 1800,
    })
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [mc(0), WRONG_MC],
    ])
    await backdateSession(f, sessionId, 2000)

    const first = await finishSeedSession(f.student, sessionId)

    expect(first.expired).toBe(true)
    expect(scalars(first)).toMatchObject({ part1: 100, part2: 100, part3: 0, passedOverall: false })
    const events = await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      part1_pct: 100,
      part2_pct: 100,
      part3_pct: 0,
      reason: 'submission past grace period',
    })
    expect(await auditMetadata(f, sessionId, 'vfr_rt_exam.completed')).toHaveLength(0)

    const second = await finishSeedSession(f.student, sessionId)

    expect(scalars(second)).toEqual(scalars(first))
    expect(resultsByQuestion(second)).toEqual(resultsByQuestion(first))
    expect(await answerRows(f, sessionId)).toHaveLength(3)
    expect(await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')).toHaveLength(1)
  })

  it('returns a passing expired VFR RT result again on a second finish when every part is correct', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: [f.shortId, f.dialogId, mc(0)],
      timeLimitSeconds: 1800,
    })
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [mc(0), RIGHT.mc],
    ])
    await backdateSession(f, sessionId, 2000)

    const first = await finishSeedSession(f.student, sessionId)

    expect(first.expired).toBe(true)
    expect(scalars(first)).toMatchObject({
      part1: 100,
      part2: 100,
      part3: 100,
      passedOverall: true,
    })

    const second = await finishSeedSession(f.student, sessionId)

    expect(scalars(second)).toEqual(scalars(first))
    expect(resultsByQuestion(second)).toEqual(resultsByQuestion(first))
    expect(await answerRows(f, sessionId)).toHaveLength(3)
    expect(await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')).toHaveLength(1)
  })

  it('recomputes the VFR RT part scores from the graded answers when a finished session has no terminal audit event', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: [f.shortId, f.dialogId, mc(0)],
      timeLimitSeconds: 1800,
    })
    const answer = (question_id: string, is_correct: boolean, blank_index: number | null) => ({
      session_id: sessionId,
      question_id,
      response_text: 'x',
      blank_index,
      is_correct,
      response_time_ms: 1000,
    })
    const { error: insErr } = await f.admin
      .from('quiz_session_answers')
      .insert([
        answer(f.shortId, false, null),
        answer(f.dialogId, true, 0),
        { ...answer(mc(0), true, null), response_text: null, selected_option_id: 'b' },
      ])
    expect(insErr).toBeNull()
    const { error: endErr } = await f.admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString(), score_percentage: 66.67, correct_count: 2 })
      .eq('id', sessionId)
    expect(endErr).toBeNull()
    expect(await auditMetadata(f, sessionId, 'vfr_rt_exam.completed')).toHaveLength(0)
    expect(await auditMetadata(f, sessionId, 'vfr_rt_exam.expired')).toHaveLength(0)

    const result = await finishSeedSession(f.student, sessionId)

    expect(scalars(result)).toMatchObject({
      part1: 0,
      part2: 100,
      part3: 100,
      passed: false,
      passedOverall: false,
      expired: undefined,
    })
  })
})
