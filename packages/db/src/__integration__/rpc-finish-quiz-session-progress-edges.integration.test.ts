import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  finishSeedSession,
  insertRawProgress,
  insertTwoBlankDialog,
  insertTwoZoneDiagram,
  saveAnswer,
} from './finish-fixture'
import { answerRows } from './finish-readers'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
} from './quiz-progress-fixture'

describe('RPC: finish_quiz_session — progress entries the grader must normalise', () => {
  let f: ProgressFixture
  let dialog2Id: string
  let diagram2Id: string

  beforeAll(async () => {
    f = await setupProgressFixture('finishe')
    dialog2Id = await insertTwoBlankDialog(f)
    diagram2Id = await insertTwoZoneDiagram(f)
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  it('gives no extra credit when one dialog blank is saved twice', async () => {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [dialog2Id] })
    await insertRawProgress(f, sessionId, dialog2Id, {
      blanks: [
        { blank_index: 0, response_text: 'cleared' },
        { blank_index: 0, response_text: 'cleared' },
      ],
    })
    expect(await progressRows(f, sessionId)).toHaveLength(1)

    const result = await finishSeedSession(f.student, sessionId)

    expect(Number(result.correct_count)).toBe(1)
    expect(Number(result.score_percentage)).toBe(50)
    const rows = await answerRows(f, sessionId)
    expect(rows.map((r) => r.blank_index)).toEqual([0])
  })

  it('stores each diagram zone under its zone ordinal when the zones were saved out of order', async () => {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [diagram2Id] })
    await saveAnswer(f, sessionId, diagram2Id, {
      mapping: [
        { zone_id: 'zn-b', label_id: 'lb-b' },
        { zone_id: 'zn-a', label_id: 'lb-a' },
      ],
    })
    const saved = await progressRows(f, sessionId)
    expect(saved).toHaveLength(1)

    const result = await finishSeedSession(f.student, sessionId)

    expect(Number(result.correct_count)).toBe(2)
    const { data, error } = await f.admin
      .from('quiz_session_answers')
      .select('blank_index, response_text')
      .eq('session_id', sessionId)
    expect(error).toBeNull()
    const byOrdinal = new Map((data ?? []).map((r) => [r.blank_index, r.response_text]))
    expect([...byOrdinal.keys()].sort()).toEqual([0, 1])
    expect(byOrdinal.get(0)).toBe('Upwind')
    expect(byOrdinal.get(1)).toBe('Downwind')
  })
})
