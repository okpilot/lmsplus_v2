import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFire } = vi.hoisted(() => ({ mockFire: vi.fn() }))

vi.mock('./progress-save', async (orig) => ({
  ...(await orig<typeof import('./progress-save')>()),
  fireProgressSave: (...a: unknown[]) => mockFire(...a),
}))

import { sendAnswerSave, sendPositionSave } from './progress-sync-saves'
import { _resetQuizDeviceId } from './quiz-device-id'

const SESSION = '00000000-0000-4000-a000-000000000001'
const QID = '00000000-0000-4000-a000-000000000011'
const handlers = { onSuccess: vi.fn(), onMappedError: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  _resetQuizDeviceId()
  vi.spyOn(Date, 'now').mockReturnValue(1_005_000)
})

describe('sendPositionSave', () => {
  it('sends the target index, the pins and the left question visit time', () => {
    sendPositionSave({
      sessionId: SESSION,
      target: 2,
      pins: new Set([QID]),
      leaving: { questionId: QID, startedAt: 1_000_000 },
      ...handlers,
    })
    expect(mockFire).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'position',
        input: expect.objectContaining({
          sessionId: SESSION,
          currentIndex: 2,
          pinnedQuestionIds: [QID],
          leaving: { questionId: QID, timeSpentMs: 5000 },
        }),
      }),
    )
  })

  it('omits the leaving question when the position moves in place', () => {
    sendPositionSave({ sessionId: SESSION, target: 1, pins: new Set(), ...handlers })
    const call = mockFire.mock.calls[0]?.[0] as { input: object }
    expect(call.input).not.toHaveProperty('leaving')
  })
})

describe('sendAnswerSave', () => {
  it('sends the chosen option with the elapsed visit time', () => {
    sendAnswerSave({
      sessionId: SESSION,
      questionId: QID,
      draft: { selectedOptionId: 'a' },
      startedAt: 1_000_000,
      ...handlers,
    })
    expect(mockFire).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'answer',
        input: expect.objectContaining({
          questionId: QID,
          answer: { selectedOptionId: 'a' },
          timeSpentMs: 5000,
        }),
      }),
    )
  })

  it('saves nothing for a draft that carries no answer', () => {
    sendAnswerSave({ sessionId: SESSION, questionId: QID, draft: {}, startedAt: 0, ...handlers })
    expect(mockFire).not.toHaveBeenCalled()
  })
})
