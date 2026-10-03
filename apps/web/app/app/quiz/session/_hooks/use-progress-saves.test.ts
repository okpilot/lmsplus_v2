import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'

const { mockSaveAnswer, mockSavePosition } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockSavePosition: vi.fn(),
}))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: (...a: unknown[]) => mockSavePosition(...a),
}))

import { useProgressSaves } from './use-progress-saves'

const SESSION = '00000000-0000-4000-a000-000000000001'
const Q = '00000000-0000-4000-a000-000000000011'
const MAPPED = 'This quiz is open in another tab or device — reload this page to continue here.'

function setup(mode: QuizStateOpts['mode'] = 'study') {
  const opts = {
    userId: 'u',
    sessionId: SESSION,
    questions: [{ id: Q }],
    mode,
  } as unknown as QuizStateOpts
  return renderHook(() =>
    useProgressSaves({ opts, currentIndexRef: { current: 0 }, answerStartTime: { current: 0 } }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockSaveAnswer.mockResolvedValue({ success: true })
  mockSavePosition.mockResolvedValue({ success: true })
})

describe('useProgressSaves', () => {
  it('saves nothing in discovery mode', () => {
    const { result } = setup('discovery')
    act(() => result.current.saveAnswer({ selectedOptionId: 'a' }))
    act(() => result.current.savePosition(0, new Set(), false))
    expect(mockSaveAnswer).not.toHaveBeenCalled()
    expect(mockSavePosition).not.toHaveBeenCalled()
  })

  it('surfaces a mapped save failure and clears it after the next successful save', async () => {
    mockSaveAnswer.mockResolvedValueOnce({ success: false, error: MAPPED })
    const { result } = setup()
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'a' }))
    expect(result.current.saveError).toBe(MAPPED)
    await act(async () => result.current.saveAnswer({ selectedOptionId: 'b' }))
    expect(result.current.saveError).toBeNull()
  })
})
