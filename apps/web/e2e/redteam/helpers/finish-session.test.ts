import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('../../helpers/supabase', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

import type { getAdminClient } from '../../helpers/supabase'
import {
  buildMcProgressAnswers,
  buildVfrRtProgressAnswers,
  finishSeedSession,
  SEED_DEVICE_ID,
  saveAndFinish,
  saveSeedAnswers,
} from './finish-session'

type AdminClient = ReturnType<typeof getAdminClient>
const adminMock = { from: mockFrom } as unknown as AdminClient
const client = { rpc: mockRpc }

function thenable(returnValue: unknown): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve(returnValue).then(resolve, reject)
        }
        return () => thenable(returnValue)
      },
    },
  )
}

const ANSWERS = [
  { question_id: 'q1', answer: { selected_option_id: 'a' } },
  { question_id: 'q2', answer: { response_text: 'wilco' } },
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('saveSeedAnswers', () => {
  it('saves every answer with the seed device when none is given', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await saveSeedAnswers(client, 'sess-1', ANSWERS)

    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'save_quiz_answer', {
      p_session_id: 'sess-1',
      p_question_id: 'q1',
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1500,
      p_device_id: SEED_DEVICE_ID,
    })
    expect(mockRpc.mock.calls[1]?.[1]).toMatchObject({ p_question_id: 'q2' })
  })

  it('stops at the first failed save and names the RPC', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'session_discarded' } })
      .mockResolvedValue({ data: null, error: null })

    await expect(saveSeedAnswers(client, 'sess-1', ANSWERS)).rejects.toThrow(
      /save_quiz_answer failed: session_discarded/,
    )
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})

describe('finishSeedSession', () => {
  it('returns the raw finish result, including an error, without throwing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_discarded' } })

    const res = await finishSeedSession(client, 'sess-1')

    expect(res.error?.message).toBe('session_discarded')
    expect(mockRpc).toHaveBeenCalledWith('finish_quiz_session', {
      p_session_id: 'sess-1',
      p_device_id: SEED_DEVICE_ID,
    })
  })
})

describe('saveAndFinish', () => {
  it('finishes only after every answer has been saved', async () => {
    mockRpc.mockResolvedValue({ data: { score_percentage: 100 }, error: null })

    const res = await saveAndFinish(client, 'sess-1', ANSWERS)

    expect(mockRpc.mock.calls.map((c) => c[0])).toEqual([
      'save_quiz_answer',
      'save_quiz_answer',
      'finish_quiz_session',
    ])
    expect(res.data).toEqual({ score_percentage: 100 })
  })

  it('does not finish when a save fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(saveAndFinish(client, 'sess-1', ANSWERS)).rejects.toThrow(/boom/)
    expect(mockRpc.mock.calls.map((c) => c[0])).not.toContain('finish_quiz_session')
  })
})

describe('buildMcProgressAnswers', () => {
  function mockReads(config: unknown, questions: unknown) {
    mockFrom
      .mockReturnValueOnce(thenable({ data: { config }, error: null }))
      .mockReturnValueOnce(thenable({ data: questions, error: null }))
  }

  it('answers each pinned question with its first option', async () => {
    mockReads({ question_ids: ['q1', 'q2'] }, [
      { id: 'q1', options: [{ id: 'c' }, { id: 'a' }] },
      { id: 'q2', options: [{ id: 'b' }] },
    ])

    const answers = await buildMcProgressAnswers(adminMock, 'sess-1')

    expect(answers).toEqual([
      { question_id: 'q1', answer: { selected_option_id: 'c' } },
      { question_id: 'q2', answer: { selected_option_id: 'b' } },
    ])
  })

  it('throws when an option id is outside a-d', async () => {
    mockReads({ question_ids: ['q1'] }, [{ id: 'q1', options: [{ id: 'opt-1' }] }])

    await expect(buildMcProgressAnswers(adminMock, 'sess-1')).rejects.toThrow(/is not a-d/)
  })

  it('throws when config.question_ids is not an array', async () => {
    mockFrom.mockReturnValueOnce(thenable({ data: { config: { question_ids: 'x' } }, error: null }))

    await expect(buildMcProgressAnswers(adminMock, 'sess-1')).rejects.toThrow(/not an array/)
  })

  it('throws when the session has no question ids', async () => {
    mockFrom.mockReturnValueOnce(thenable({ data: { config: { question_ids: [] } }, error: null }))

    await expect(buildMcProgressAnswers(adminMock, 'sess-1')).rejects.toThrow(/no question_ids/)
  })
})

describe('buildVfrRtProgressAnswers', () => {
  const POOL = [
    { id: 'sa', question_type: 'short_answer' },
    { id: 'df', question_type: 'dialog_fill' },
    { id: 'mc', question_type: 'multiple_choice' },
    { id: 'or', question_type: 'ordering' },
    { id: 'dl', question_type: 'diagram_label' },
  ]

  it('builds one correctly shaped answer per question type', () => {
    const answers = buildVfrRtProgressAnswers(POOL)

    expect(answers.map((a) => a.question_id)).toEqual(['sa', 'df', 'mc', 'or', 'dl'])
    expect(answers[0]?.answer).toHaveProperty('response_text')
    expect(answers[1]?.answer).toMatchObject({ blanks: [{ blank_index: 0 }] })
    expect(answers[2]?.answer).toEqual({ selected_option_id: 'b' })
    expect(answers[3]?.answer).toEqual({ order: expect.any(Array) })
    expect(answers[4]?.answer).toEqual({ mapping: expect.any(Array) })
  })

  it('makes only the dialog_fill answer wrong when failPart2 is set', () => {
    const right = buildVfrRtProgressAnswers(POOL)
    const wrong = buildVfrRtProgressAnswers(POOL, { failPart2: true })

    expect(wrong[1]?.answer).not.toEqual(right[1]?.answer)
    expect([wrong[0], wrong[2], wrong[3], wrong[4]]).toEqual([
      right[0],
      right[2],
      right[3],
      right[4],
    ])
  })

  it('rejects an unknown question type', () => {
    expect(() => buildVfrRtProgressAnswers([{ id: 'x', question_type: 'essay' }])).toThrow(
      /unsupported question_type essay/,
    )
  })
})
