import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  insertDialogWithNullSynonyms,
  insertDialogWithoutIndex,
  insertMcKeyNotInOptions,
} from './finish-broken-fixture'
import {
  backdateSession,
  finishOk,
  insertDialogWithoutCanonical,
  insertDialogWithTextIndex,
  insertRawProgress,
  insertTwoBlankDialog,
  insertTwoZoneDiagram,
  RIGHT,
  saveAnswer,
  saveAnswers,
  saveViewedOnly,
  WRONG_MC,
} from './finish-fixture'
import {
  answerRows,
  auditMetadata,
  fsrsQuestionIds,
  responseCount,
  sessionRow,
} from './finish-readers'
import { requireRpcResult } from './guards'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'

describe('RPC: finish_quiz_session — grades the saved answers', () => {
  let f: ProgressFixture
  let dialog2Id: string
  let diagram2Id: string
  let defectDialogId: string
  let textIndexDialogId: string
  let noIndexDialogId: string
  let nullSynonymsDialogId: string
  let brokenMcId: string

  beforeAll(async () => {
    f = await setupProgressFixture('finish')
    dialog2Id = await insertTwoBlankDialog(f)
    diagram2Id = await insertTwoZoneDiagram(f)
    defectDialogId = await insertDialogWithoutCanonical(f)
    textIndexDialogId = await insertDialogWithTextIndex(f)
    noIndexDialogId = await insertDialogWithoutIndex(f)
    nullSynonymsDialogId = await insertDialogWithNullSynonyms(f)
    brokenMcId = await insertMcKeyNotInOptions(f)
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
    const { error } = await f.admin.from('fsrs_cards').delete().eq('student_id', f.studentId)
    expect(error).toBeNull()
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  it.each([['quick_quiz' as const], ['smart_review' as const]])(
    'scores a %s session on the answered questions only and ignores viewed-only ones',
    async (mode) => {
      const ids = [mc(0), mc(1), mc(2)]
      const sessionId = await startPractice(f, mode, ids)
      await saveAnswers(f, sessionId, [
        [mc(0), RIGHT.mc],
        [mc(1), WRONG_MC],
      ])
      await saveViewedOnly(f, sessionId, mc(2))
      expect(await progressRows(f, sessionId)).toHaveLength(3)
      expect(await answerRows(f, sessionId)).toHaveLength(0)

      const result = await finishOk(f, sessionId)

      expect(result.total_questions).toBe(3)
      expect(Number(result.answered_count)).toBe(2)
      expect(Number(result.correct_count)).toBe(1)
      expect(Number(result.score_percentage)).toBe(50)
      const rows = await answerRows(f, sessionId)
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.question_id === mc(0))?.is_correct).toBe(true)
      expect(rows.find((r) => r.question_id === mc(1))?.is_correct).toBe(false)
      expect(await responseCount(f, sessionId)).toBe(2)
      expect((await sessionRow(f, sessionId)).ended_at).not.toBeNull()
    },
  )

  it('writes a spaced-repetition card for each answered multiple-choice question in a smart review', async () => {
    const sessionId = await startPractice(f, 'smart_review', [mc(0), mc(1), mc(2)])
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [mc(1), WRONG_MC],
    ])
    expect(await fsrsQuestionIds(f, [mc(0), mc(1), mc(2)])).toEqual([])

    await finishOk(f, sessionId)

    expect((await fsrsQuestionIds(f, [mc(0), mc(1), mc(2)])).sort()).toEqual([mc(0), mc(1)].sort())
  })

  it('gives a mock exam partial credit over every question, counting unanswered ones as wrong', async () => {
    const ids = [
      mc(0),
      f.shortId,
      f.dialogId,
      f.orderingId,
      f.diagramId,
      mc(1),
      mc(2),
      mc(3),
      mc(4),
    ]
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: ids })
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [f.orderingId, RIGHT.ordering],
      [f.diagramId, RIGHT.diagram],
    ])

    const result = await finishOk(f, sessionId)

    expect(result.total_questions).toBe(9)
    expect(Number(result.answered_count)).toBe(5)
    // rows: mc 1 + short 1 + dialog 1 + ordering 2 slots + diagram 1
    expect(Number(result.correct_count)).toBe(6)
    expect(Number(result.score_percentage)).toBe(55.56)
    expect(result.passed).toBe(false)
    const stored = await sessionRow(f, sessionId)
    expect(Number(stored.score_percentage)).toBe(55.56)
    expect(stored.passed).toBe(false)
    expect(await auditMetadata(f, sessionId, 'exam.completed')).toHaveLength(1)
  })

  it('gives half credit for a dialog with one of two blanks right in an internal exam', async () => {
    const sessionId = await insertSession({ f, mode: 'internal_exam', questionIds: [dialog2Id] })
    await saveAnswer(f, sessionId, dialog2Id, {
      blanks: [
        { blank_index: 0, response_text: 'cleared' },
        { blank_index: 1, response_text: 'wrong' },
      ],
    })

    const result = await finishOk(f, sessionId)

    expect(Number(result.answered_count)).toBe(1)
    expect(Number(result.correct_count)).toBe(1)
    expect(Number(result.score_percentage)).toBe(50)
    expect(result.passed).toBe(false)
    expect(await auditMetadata(f, sessionId, 'internal_exam.completed')).toHaveLength(1)
  })

  it('scores a VFR RT exam per part, passes only when every part reaches 75, and writes no spaced-repetition card', async () => {
    const ids = [f.shortId, f.dialogId, mc(0), f.orderingId, f.diagramId]
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: ids,
      timeLimitSeconds: 1800,
    })
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [mc(0), WRONG_MC],
      [f.orderingId, RIGHT.ordering],
      [f.diagramId, RIGHT.diagram],
    ])

    const result = await finishOk(f, sessionId)

    expect(result.session_id).toBe(sessionId)
    expect(Number(result.part1_pct)).toBe(100)
    expect(Number(result.part2_pct)).toBe(100)
    expect(Number(result.part3_pct)).toBe(66.67)
    expect(Number(result.score_percentage)).toBe(88.89)
    expect(result.passed_overall).toBe(false)
    const events = await auditMetadata(f, sessionId, 'vfr_rt_exam.completed')
    expect(events).toHaveLength(1)
    expect(Number(events[0]?.part3_pct)).toBe(66.67)
    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([])
  })

  it('returns the stored result on a second finish and writes nothing new', async () => {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    const first = await finishOk(f, sessionId)
    expect(Number(first.score_percentage)).toBe(50)
    const rowsBefore = await answerRows(f, sessionId)
    expect(rowsBefore).toHaveLength(1)

    const second = await finishOk(f, sessionId)

    expect(Number(second.score_percentage)).toBe(50)
    expect(Number(second.answered_count)).toBe(Number(first.answered_count))
    expect(Number(second.correct_count)).toBe(Number(first.correct_count))
    expect(second.total_questions).toBe(first.total_questions)
    expect(await answerRows(f, sessionId)).toHaveLength(1)
    expect(await responseCount(f, sessionId)).toBe(1)
    expect(await auditMetadata(f, sessionId, 'exam.completed')).toHaveLength(1)
  })

  it('grades the saved answers of a session finished past its deadline and flags it expired', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: [mc(0), mc(1)],
      timeLimitSeconds: 60,
    })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    await backdateSession(f, sessionId, 200)

    const result = await finishOk(f, sessionId)

    expect(result.expired).toBe(true)
    expect(Number(result.answered_count)).toBe(1)
    expect(Number(result.score_percentage)).toBe(50)
    expect(result.passed).toBe(false)
    const events = await auditMetadata(f, sessionId, 'exam.expired')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      total_questions: 2,
      answered_count: 1,
      correct_count: 1,
      score: 50,
      passed: false,
      reason: 'submission past grace period',
    })
    expect(await auditMetadata(f, sessionId, 'exam.completed')).toHaveLength(0)
  })

  describe('a saved answer that cannot be graded', () => {
    const cases: Array<[string, () => { questionId: string; answer: unknown }]> = [
      [
        'an option the question does not offer',
        () => ({ questionId: mc(1), answer: { selected_option_id: 'z' } }),
      ],
      [
        'a dialog blank the question does not have',
        () => ({
          questionId: f.dialogId,
          answer: { blanks: [{ blank_index: 7, response_text: 'cleared' }] },
        }),
      ],
      [
        'an ordering that repeats an item',
        () => {
          const first = RIGHT.ordering.order[0]
          return { questionId: f.orderingId, answer: { order: [first, first] } }
        },
      ],
      [
        'a diagram zone the question does not have',
        () => ({
          questionId: f.diagramId,
          answer: { mapping: [{ zone_id: 'zone-9', label_id: 'lbl-1' }] },
        }),
      ],
      [
        'a diagram label used on two zones',
        () => ({
          questionId: diagram2Id,
          answer: {
            mapping: [
              { zone_id: 'zn-a', label_id: 'lb-a' },
              { zone_id: 'zn-b', label_id: 'lb-a' },
            ],
          },
        }),
      ],
    ]

    it.each(cases)('is graded as unanswered, not an error: %s', async (_title, build) => {
      const { questionId, answer } = build()
      const sessionId = await insertSession({
        f,
        mode: 'mock_exam',
        questionIds: [questionId, mc(0)],
      })
      await insertRawProgress(f, sessionId, questionId, answer)
      await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
      expect((await progressRows(f, sessionId)).map((r) => r.question_id)).toContain(questionId)

      const result = await finishOk(f, sessionId)

      expect(Number(result.answered_count)).toBe(1)
      expect(Number(result.score_percentage)).toBe(50)
      const rows = await answerRows(f, sessionId)
      expect(rows.map((r) => r.question_id)).toEqual([mc(0)])
    })
  })

  const brokenCases: Array<[string, () => string]> = [
    ['a blank lacking a canonical answer', () => defectDialogId],
    ['a blank whose index is not a number', () => textIndexDialogId],
    ['a blank lacking an index', () => noIndexDialogId],
    ['a blank whose synonyms are null', () => nullSynonymsDialogId],
  ]

  it.each(brokenCases)(
    "leaves a dialog with %s out of a mock exam's score",
    async (_title, build) => {
      const brokenId = build()
      const sessionId = await insertSession({
        f,
        mode: 'mock_exam',
        questionIds: [brokenId, mc(0)],
      })
      await insertRawProgress(f, sessionId, brokenId, {
        blanks: [{ blank_index: 0, response_text: 'cleared' }],
      })
      await saveAnswer(f, sessionId, mc(0), RIGHT.mc)

      const result = await finishOk(f, sessionId)

      expect(Number(result.answered_count)).toBe(1)
      expect(Number(result.correct_count)).toBe(1)
      expect(Number(result.score_percentage)).toBe(100)
      expect(result.passed).toBe(true)
      expect((await answerRows(f, sessionId)).map((r) => r.question_id)).toEqual([mc(0)])
      expect(Number((await sessionRow(f, sessionId)).score_percentage)).toBe(100)
    },
  )

  it('leaves a multiple-choice question whose key is not among its options out of the score, even when unanswered', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: [brokenMcId, mc(0)],
    })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)

    const result = await finishOk(f, sessionId)

    expect(Number(result.answered_count)).toBe(1)
    expect(Number(result.score_percentage)).toBe(100)
    expect(result.passed).toBe(true)
    expect((await answerRows(f, sessionId)).map((r) => r.question_id)).toEqual([mc(0)])
  })

  it('scores zero and fails a mock exam whose every question has broken bank data', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: [brokenMcId, defectDialogId],
    })

    const result = await finishOk(f, sessionId)

    expect(Number(result.answered_count)).toBe(0)
    expect(Number(result.score_percentage)).toBe(0)
    expect(result.passed).toBe(false)
    expect(await answerRows(f, sessionId)).toHaveLength(0)
  })

  it('scores a VFR RT part without its broken question, on finish and on the results page', async () => {
    const ids = [f.shortId, defectDialogId, f.dialogId, mc(0)]
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: ids,
      timeLimitSeconds: 1800,
    })
    await saveAnswers(f, sessionId, [
      [f.shortId, RIGHT.short],
      [f.dialogId, RIGHT.dialog],
      [mc(0), RIGHT.mc],
    ])
    await insertRawProgress(f, sessionId, defectDialogId, {
      blanks: [{ blank_index: 0, response_text: 'cleared' }],
    })

    const result = await finishOk(f, sessionId)

    expect(Number(result.part2_pct)).toBe(100)
    const { data, error } = await f.student.rpc('get_vfr_rt_exam_results', {
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    const results = requireRpcResult<{ part2_pct: number | string }>(
      data,
      'get_vfr_rt_exam_results',
    )
    expect(Number(results.part2_pct)).toBe(100)
  })

  it('ignores saved progress for a question that is not part of the session', async () => {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    await insertRawProgress(f, sessionId, mc(2), RIGHT.mc)
    expect(await progressRows(f, sessionId)).toHaveLength(2)

    const result = await finishOk(f, sessionId)

    expect(Number(result.answered_count)).toBe(1)
    expect(Number(result.score_percentage)).toBe(50)
    expect((await answerRows(f, sessionId)).map((r) => r.question_id)).toEqual([mc(0)])
  })

  it('schedules a review card for an answered multiple-choice question in a mock exam', async () => {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([])

    await finishOk(f, sessionId)

    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([mc(0)])
  })

  it('schedules a review card for an answered multiple-choice question in a quick quiz', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [mc(0), mc(1)])
    await saveAnswer(f, sessionId, mc(0), WRONG_MC)
    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([])

    await finishOk(f, sessionId)

    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([mc(0)])
  })

  it('schedules no review card for a multiple-choice answer in a VFR RT exam', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'vfr_rt_exam',
      questionIds: [mc(0), f.shortId],
      timeLimitSeconds: 1800,
    })
    await saveAnswers(f, sessionId, [
      [mc(0), RIGHT.mc],
      [f.shortId, RIGHT.short],
    ])
    const before = await progressRows(f, sessionId)
    expect(before).toHaveLength(2)

    await finishOk(f, sessionId)

    expect((await answerRows(f, sessionId)).map((r) => r.question_id)).toContain(mc(0))
    expect(await fsrsQuestionIds(f, [mc(0)])).toEqual([])
  })
})
