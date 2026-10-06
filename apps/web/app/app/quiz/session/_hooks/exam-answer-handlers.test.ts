import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExamAnswerHandlers } from './exam-answer-handlers'

const recordAnswer = vi.fn()

function build() {
  return buildExamAnswerHandlers({ recordAnswer })
}

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
    const h = buildExamAnswerHandlers({ recordAnswer, onRecorded })
    await h.handleSelectAnswer('opt-a')
    expect(onRecorded).toHaveBeenCalledWith({ selectedOptionId: 'opt-a' })
  })

  it('stays silent when the answer was already locked', async () => {
    const onRecorded = vi.fn()
    recordAnswer.mockReturnValue(false)
    const h = buildExamAnswerHandlers({ recordAnswer, onRecorded })
    await h.handleSelectAnswer('opt-a')
    expect(onRecorded).not.toHaveBeenCalled()
  })
})
