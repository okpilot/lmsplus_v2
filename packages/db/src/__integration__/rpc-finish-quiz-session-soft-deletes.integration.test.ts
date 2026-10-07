import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  type FinishResult,
  finishSeedSession,
  finishSession,
  RIGHT,
  saveAnswer,
  saveAnswers,
  WRONG_MC,
} from './finish-fixture'
import { answerRows, sessionRow } from './finish-readers'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
} from './quiz-progress-fixture'

const EXPLANATION = 'DISTINCT-EXPLANATION-q1'

describe('RPC: finish_quiz_session — soft-deleted questions and users', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('finishsd')
    const { error } = await f.admin
      .from('questions')
      .update({ explanation_text: EXPLANATION })
      .eq('id', f.mcIds[0] ?? '')
    expect(error).toBeNull()
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  async function setQuestionDeleted(questionId: string, deleted: boolean) {
    const { error } = await f.admin
      .from('questions')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', questionId)
    expect(error).toBeNull()
  }

  async function setStudentDeleted(deleted: boolean) {
    const { error } = await f.admin
      .from('users')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', f.studentId)
    expect(error).toBeNull()
  }

  function resultFor(result: FinishResult, questionId: string) {
    const row = result.results.find(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        (r as { question_id?: unknown }).question_id === questionId,
    )
    expect(row, `results must carry ${questionId}`).toBeDefined()
    return row as { is_correct: boolean; correct_option_id: unknown; explanation_text: unknown }
  }

  describe('a question soft-deleted after the student saved an answer to it', () => {
    it('is still graded, recorded and returned with its key and explanation on finish and on a second finish', async () => {
      const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
      await saveAnswers(f, sessionId, [
        [mc(0), WRONG_MC],
        [mc(1), RIGHT.mc],
      ])
      expect(await progressRows(f, sessionId)).toHaveLength(2)
      try {
        await setQuestionDeleted(mc(0), true)

        const first = await finishSeedSession(f.student, sessionId)

        expect(Number(first.answered_count)).toBe(2)
        expect(Number(first.correct_count)).toBe(1)
        expect(Number(first.score_percentage)).toBe(50)
        const rows = await answerRows(f, sessionId)
        expect(rows.find((r) => r.question_id === mc(0))?.is_correct).toBe(false)
        expect(resultFor(first, mc(0))).toMatchObject({
          is_correct: false,
          correct_option_id: 'b',
          explanation_text: EXPLANATION,
        })

        const second = await finishSeedSession(f.student, sessionId)
        expect(Number(second.answered_count)).toBe(2)
        expect(resultFor(second, mc(0))).toMatchObject({
          correct_option_id: 'b',
          explanation_text: EXPLANATION,
        })
      } finally {
        await setQuestionDeleted(mc(0), false)
      }
    })

    it('is still returned with its key and explanation when the stored result is re-read', async () => {
      const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
      await saveAnswers(f, sessionId, [
        [mc(0), WRONG_MC],
        [mc(1), RIGHT.mc],
      ])
      const first = await finishSeedSession(f.student, sessionId)
      expect(resultFor(first, mc(0)).correct_option_id).toBe('b')
      try {
        await setQuestionDeleted(mc(0), true)

        const replay = await finishSeedSession(f.student, sessionId)

        expect(replay.results).toHaveLength(2)
        expect(resultFor(replay, mc(0))).toMatchObject({
          correct_option_id: 'b',
          explanation_text: EXPLANATION,
        })
      } finally {
        await setQuestionDeleted(mc(0), false)
      }
    })
  })

  describe('a soft-deleted student', () => {
    it('cannot finish an open session, which keeps its saved answer and stays open', async () => {
      const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
      await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
      expect(await progressRows(f, sessionId)).toHaveLength(1)
      try {
        await setStudentDeleted(true)

        const { error } = await finishSession(f.student, sessionId)

        expect(error?.message).toContain('user_not_found_or_inactive')
      } finally {
        await setStudentDeleted(false)
      }
      expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
      expect(await answerRows(f, sessionId)).toHaveLength(0)
      expect(await progressRows(f, sessionId)).toHaveLength(1)
    })

    it('cannot re-read the stored result of a finished session, which keeps its score', async () => {
      const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
      await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
      await finishSeedSession(f.student, sessionId)
      const before = await sessionRow(f, sessionId)
      expect(before.ended_at).not.toBeNull()
      expect(Number(before.score_percentage)).toBe(50)
      expect(await answerRows(f, sessionId)).toHaveLength(1)
      try {
        await setStudentDeleted(true)

        const { data, error } = await finishSession(f.student, sessionId)

        expect(error?.message).toContain('user_not_found_or_inactive')
        expect(data).toBeNull()
      } finally {
        await setStudentDeleted(false)
      }
      expect(await sessionRow(f, sessionId)).toEqual(before)
      expect(await answerRows(f, sessionId)).toHaveLength(1)
    })
  })
})
