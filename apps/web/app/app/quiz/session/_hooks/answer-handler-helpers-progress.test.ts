import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckAnswer, mockCheckNonMcAnswer } = vi.hoisted(() => ({
  mockCheckAnswer: vi.fn(),
  mockCheckNonMcAnswer: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...a: unknown[]) => mockCheckAnswer(...a),
}))
vi.mock('../../actions/check-non-mc-answer', () => ({
  checkNonMcAnswer: (...a: unknown[]) => mockCheckNonMcAnswer(...a),
}))

import { _resetQuizDeviceId, getQuizDeviceId } from '../_utils/quiz-device-id'
import type { AttemptInput } from './answer-handler-helpers'
import { buildAnswerHandlers, checkErrorMessage } from './answer-handler-helpers'

const SESSION_ID = '00000000-0000-4000-b000-000000000001'
const Q_ID = '00000000-0000-4000-b000-000000000011'
const GENERIC = 'Failed to check answer. Please try again.'

function harness(startedAgoMs: number) {
  const attempts: AttemptInput[] = []
  const handlers = buildAnswerHandlers({
    sessionId: SESSION_ID,
    getAnswerStartTime: () => Date.now() - startedAgoMs,
    runAttempt: async (a) => {
      attempts.push(a)
      return true
    },
  })
  return { handlers, attempts }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  _resetQuizDeviceId()
})

describe('check calls carry progress meta', () => {
  it('sends the tab device id and visit time with a multiple-choice check', async () => {
    mockCheckAnswer.mockResolvedValue({ success: true, isCorrect: true })
    const { handlers, attempts } = harness(3000)
    await handlers.handleSelectAnswer('a')
    await attempts[0]?.check(Q_ID)
    const sent = mockCheckAnswer.mock.calls[0]?.[0]
    expect(sent).toMatchObject({ sessionId: SESSION_ID, deviceId: getQuizDeviceId() })
    expect(sent.timeSpentMs).toBeGreaterThanOrEqual(3000)
    expect(sent.timeSpentMs).toBeLessThan(4000)
  })

  it.each([
    ['handleTextAnswer', 'x'],
    ['handleDialogFillAnswer', [{ index: 0, text: 'x' }]],
    ['handleOrderingAnswer', ['a']],
    ['handleDiagramLabelAnswer', [{ zoneId: 'z', labelId: 'l' }]],
  ] as const)('sends the device id and a clamped time with %s', async (key, arg) => {
    mockCheckNonMcAnswer.mockResolvedValue({ success: false, error: 'x' })
    const { handlers, attempts } = harness(10 ** 12)
    await (handlers[key] as (a: unknown) => Promise<boolean>)(arg)
    await attempts[0]?.check(Q_ID).catch(() => {})
    expect(mockCheckNonMcAnswer.mock.calls[0]?.[0]).toMatchObject({
      sessionId: SESSION_ID,
      deviceId: getQuizDeviceId(),
      timeSpentMs: 86_400_000,
    })
  })

  it('throws the server message so the mapped copy can reach the student', async () => {
    mockCheckAnswer.mockResolvedValue({ success: false, error: 'mapped copy' })
    const { handlers, attempts } = harness(0)
    await handlers.handleSelectAnswer('a')
    await expect(attempts[0]?.check(Q_ID)).rejects.toThrow('mapped copy')
  })
})

describe('checkErrorMessage', () => {
  it('returns mapped progress copy as is', () => {
    const mapped = 'This session has already ended.'
    expect(checkErrorMessage(new Error(mapped))).toBe(mapped)
  })

  it('falls back to the generic message for unmapped or non-Error failures', () => {
    expect(checkErrorMessage(new Error('Could not check answer'))).toBe(GENERIC)
    expect(checkErrorMessage('boom')).toBe(GENERIC)
  })
})
