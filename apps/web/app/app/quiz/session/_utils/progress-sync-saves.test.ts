import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFire } = vi.hoisted(() => ({ mockFire: vi.fn() }))

vi.mock('./progress-save', async (orig) => ({
  ...(await orig<typeof import('./progress-save')>()),
  fireProgressSave: (...a: unknown[]) => mockFire(...a),
}))

import {
  buildRunnerSaves,
  resendUnsavedAnswers,
  sendAnswerSave,
  sendPositionSave,
} from './progress-sync-saves'
import { _resetQuizDeviceId } from './quiz-device-id'
import { _resetUnsavedAnswers } from './unsaved-answers'

const SESSION = '00000000-0000-4000-a000-000000000001'
const QID = '00000000-0000-4000-a000-000000000011'
const QID2 = '00000000-0000-4000-a000-000000000012'
const handlers = { onSuccess: vi.fn(), onMappedError: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  mockFire.mockResolvedValue('saved')
  _resetQuizDeviceId()
  _resetUnsavedAnswers()
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

describe('buildRunnerSaves', () => {
  const deps = (enabled: boolean, question?: { id: string }) => ({
    sessionId: SESSION,
    enabled,
    currentQuestion: () => question,
    visitStartedAt: () => 1_000_000,
    ...handlers,
  })

  it('records the time spent on the question being left', () => {
    buildRunnerSaves(deps(true, { id: QID })).savePosition(3, new Set(), true)
    expect(mockFire).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          currentIndex: 3,
          leaving: { questionId: QID, timeSpentMs: 5000 },
        }),
      }),
    )
  })

  it('saves the answer for the question on screen', () => {
    buildRunnerSaves(deps(true, { id: QID })).saveAnswer({ selectedOptionId: 'b' })
    expect(mockFire).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'answer',
        input: expect.objectContaining({ questionId: QID }),
      }),
    )
  })

  it('saves nothing when saving is disabled', () => {
    const saves = buildRunnerSaves(deps(false, { id: QID }))
    saves.savePosition(1, new Set(), true)
    saves.saveAnswer({ selectedOptionId: 'b' })
    expect(mockFire).not.toHaveBeenCalled()
  })
})

describe('resendUnsavedAnswers', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0))
  const send = (answer: string) =>
    sendAnswerSave({
      sessionId: SESSION,
      questionId: QID,
      draft: { selectedOptionId: answer },
      startedAt: 1_000_000,
      ...handlers,
    })
  const sentInput = (n: number) =>
    (mockFire.mock.calls[n]?.[0] as { input: unknown } | undefined)?.input
  const resend = () => resendUnsavedAnswers({ sessionId: SESSION, onMappedError: vi.fn() })

  it('re-sends a failed answer save with the same input and resolves true when it lands', async () => {
    mockFire.mockResolvedValueOnce('failed')
    send('a')
    await settle()
    const original = sentInput(0)
    expect(original).toBeDefined()
    mockFire.mockResolvedValueOnce('saved')
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).toHaveBeenCalledTimes(2)
    expect(sentInput(1)).toBe(original)
  })

  it('resolves false when the re-sent save fails again', async () => {
    mockFire.mockResolvedValue('failed')
    send('a')
    await settle()
    await expect(resend()).resolves.toBe(false)
    expect(mockFire).toHaveBeenCalledTimes(2)
  })

  const sendSecond = () =>
    sendAnswerSave({
      sessionId: SESSION,
      questionId: QID2,
      draft: { selectedOptionId: 'b' },
      startedAt: 1_000_000,
      ...handlers,
    })

  it('re-sends failed answers for two questions with their own inputs and resolves true when both land', async () => {
    mockFire.mockResolvedValueOnce('failed').mockResolvedValueOnce('failed')
    send('a')
    sendSecond()
    await settle()
    const [first, second] = [sentInput(0), sentInput(1)]
    expect(first).not.toEqual(second)
    mockFire.mockResolvedValue('saved')
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).toHaveBeenCalledTimes(4)
    expect(sentInput(2)).toBe(first)
    expect(sentInput(3)).toBe(second)
  })

  it('resolves false when one of two re-sent answers still fails', async () => {
    mockFire.mockResolvedValueOnce('failed').mockResolvedValueOnce('failed')
    send('a')
    sendSecond()
    await settle()
    mockFire.mockResolvedValueOnce('saved').mockResolvedValueOnce('failed')
    await expect(resend()).resolves.toBe(false)
    expect(mockFire).toHaveBeenCalledTimes(4)
  })

  it('does not re-send an answer the server rejected and resolves true', async () => {
    mockFire.mockResolvedValueOnce('rejected')
    send('a')
    await settle()
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).toHaveBeenCalledTimes(1)
  })

  it('re-sends an answer that failed rather than was rejected', async () => {
    mockFire.mockResolvedValueOnce('failed')
    send('a')
    await settle()
    mockFire.mockResolvedValueOnce('saved')
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).toHaveBeenCalledTimes(2)
  })

  it('resolves true when the re-send itself is rejected', async () => {
    mockFire.mockResolvedValueOnce('failed')
    send('a')
    await settle()
    mockFire.mockResolvedValueOnce('rejected')
    await expect(resend()).resolves.toBe(true)
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).toHaveBeenCalledTimes(2)
  })

  it('resolves true and sends nothing when no answer save failed', async () => {
    await expect(resend()).resolves.toBe(true)
    expect(mockFire).not.toHaveBeenCalled()
  })

  it('does not re-send an answer save that landed', async () => {
    send('a')
    await settle()
    await resend()
    expect(mockFire).toHaveBeenCalledTimes(1)
  })
})
