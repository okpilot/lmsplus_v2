import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExamAnswerHandlers } from './exam-answer-handlers'

const recordAnswer = vi.fn()
const dropAnswer = vi.fn()
const getQuestionId = vi.fn()

function build(onRecorded?: Parameters<typeof buildExamAnswerHandlers>[0]['onRecorded']) {
  return buildExamAnswerHandlers({ recordAnswer, getQuestionId, dropAnswer, onRecorded })
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('buildExamAnswerHandlers', () => {
  it.each([
    ['handleSelectAnswer', 'opt-a', { selectedOptionId: 'opt-a' }],
    ['handleTextAnswer', 'cleared', { responseText: 'cleared' }],
    [
      'handleDialogFillAnswer',
      [{ index: 0, text: 'x' }],
      { blankAnswers: [{ index: 0, text: 'x' }] },
    ],
    ['handleOrderingAnswer', ['a', 'b'], { order: ['a', 'b'] }],
    [
      'handleDiagramLabelAnswer',
      [{ zoneId: 'z', labelId: 'l' }],
      { mapping: [{ zoneId: 'z', labelId: 'l' }] },
    ],
  ] as const)('%s buffers the answer', async (key, arg, draft) => {
    recordAnswer.mockReturnValue(true)
    const handler = build()[key] as (a: unknown) => Promise<boolean>
    expect(await handler(arg)).toBe(true)
    expect(recordAnswer).toHaveBeenCalledWith(draft)
  })

  it('resolves false when the answer is already locked', async () => {
    recordAnswer.mockReturnValue(false)
    expect(await build().handleOrderingAnswer(['a'])).toBe(false)
  })

  it('records nothing and resolves false for an empty diagram mapping', async () => {
    expect(await build().handleDiagramLabelAnswer([])).toBe(false)
    expect(recordAnswer).not.toHaveBeenCalled()
  })
})

describe('buildExamAnswerHandlers — onRecorded', () => {
  it('reports a newly recorded draft', async () => {
    const onRecorded = vi.fn()
    recordAnswer.mockReturnValue(true)
    await build(onRecorded).handleSelectAnswer('opt-a')
    expect(onRecorded).toHaveBeenCalledWith({ selectedOptionId: 'opt-a' })
  })

  it('stays silent when the answer was already locked', async () => {
    const onRecorded = vi.fn()
    recordAnswer.mockReturnValue(false)
    await build(onRecorded).handleSelectAnswer('opt-a')
    expect(onRecorded).not.toHaveBeenCalled()
  })
})

describe('buildExamAnswerHandlers — refused save', () => {
  it('unlocks the answered question when its save is rejected', async () => {
    recordAnswer.mockReturnValue(true)
    getQuestionId.mockReturnValue('q1')
    const onRecorded = vi.fn(async () => {
      getQuestionId.mockReturnValue('q2')
      return 'rejected' as const
    })
    expect(await build(onRecorded).handleSelectAnswer('opt-a')).toBe(true)
    await flush()
    expect(dropAnswer).toHaveBeenCalledWith('q1')
  })

  it.each(['saved', 'failed', undefined] as const)(
    'keeps the answer when the save resolves %s',
    async (outcome) => {
      recordAnswer.mockReturnValue(true)
      getQuestionId.mockReturnValue('q1')
      await build(async () => outcome).handleSelectAnswer('opt-a')
      await flush()
      expect(dropAnswer).not.toHaveBeenCalled()
    },
  )

  it('resolves before the save settles', async () => {
    recordAnswer.mockReturnValue(true)
    getQuestionId.mockReturnValue('q1')
    const pending = new Promise<'rejected'>(() => {})
    expect(await build(() => pending).handleSelectAnswer('opt-a')).toBe(true)
  })
})
