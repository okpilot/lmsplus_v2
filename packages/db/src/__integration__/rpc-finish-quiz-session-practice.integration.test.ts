import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { finishSeedSession, finishSession, RIGHT, saveAnswers, WRONG_MC } from './finish-fixture'
import { auditMetadata, sessionRow } from './finish-readers'
import { type ProgressFixture, setupProgressFixture, startPractice } from './quiz-progress-fixture'

describe('RPC: finish_quiz_session — practice sessions', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('finishp')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  it('rounds two of three correct answers to 66.67 and records them on the batch_submitted audit event', async () => {
    const ids = [mc(0), mc(1), mc(2)]
    const sessionId = await startPractice(f, 'quick_quiz', ids)
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [mc(1), RIGHT.mc],
      [mc(2), WRONG_MC],
    ])

    const result = await finishSeedSession(f.student, sessionId)

    expect(result.total_questions).toBe(3)
    expect(Number(result.answered_count)).toBe(3)
    expect(Number(result.correct_count)).toBe(2)
    expect(Number(result.score_percentage)).toBe(66.67)
    expect(Number((await sessionRow(f, sessionId)).score_percentage)).toBe(66.67)
    const events = await auditMetadata(f, sessionId, 'quiz_session.batch_submitted')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ total_questions: 3, correct_count: 2, score: 66.67 })
  })

  it('finishes exactly once when two finish calls race on one session', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [mc(0), mc(1), mc(2)])
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [mc(1), RIGHT.mc],
      [mc(2), WRONG_MC],
    ])

    const results = await Promise.all([
      finishSession(f.student, sessionId),
      finishSession(f.student, sessionId),
    ])

    const outcomes = results.map((r) => r.error?.message ?? 'success')
    expect(outcomes, outcomes.join(' | ')).toEqual(['success', 'success'])
    const [a, b] = results.map((r) => r.data as Record<string, unknown>)
    expect(a).toEqual(b)
    expect(Number(a?.correct_count)).toBe(2)
    expect(Number(a?.score_percentage)).toBe(66.67)
    expect((await sessionRow(f, sessionId)).ended_at).not.toBeNull()
    expect(await auditMetadata(f, sessionId, 'quiz_session.batch_submitted')).toHaveLength(1)
  })

  it('no longer exposes the legacy complete_quiz_session RPC', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [mc(0)])

    const { error } = await f.student.rpc('complete_quiz_session', { p_session_id: sessionId })

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/could not find the function|does not exist|schema cache/i)
    expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
  })
})
