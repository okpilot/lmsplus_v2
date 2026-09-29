import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExamAnswerHandlers } from './exam-answer-handlers'

const recordAnswer = vi.fn()
const checkpoint = vi.fn()

function build() {
  return buildExamAnswerHandlers({ recordAnswer, checkpoint })
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
  ] as const)('%s buffers the answer and checkpoints once', async (key, arg, draft) => {
    recordAnswer.mockReturnValue(true)
    const handler = build()[key] as (a: unknown) => Promise<boolean>
    expect(await handler(arg)).toBe(true)
    expect(recordAnswer).toHaveBeenCalledWith(draft)
    expect(checkpoint).toHaveBeenCalledTimes(1)
  })

  it('resolves false without checkpointing when the answer is already locked', async () => {
    recordAnswer.mockReturnValue(false)
    expect(await build().handleOrderingAnswer(['a'])).toBe(false)
    expect(checkpoint).not.toHaveBeenCalled()
  })

  it('records nothing and resolves false for an empty diagram mapping', async () => {
    expect(await build().handleDiagramLabelAnswer([])).toBe(false)
    expect(recordAnswer).not.toHaveBeenCalled()
    expect(checkpoint).not.toHaveBeenCalled()
  })
})
