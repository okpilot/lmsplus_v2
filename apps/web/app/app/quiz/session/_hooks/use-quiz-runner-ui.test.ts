import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockTab, mockUI, mockLeave } = vi.hoisted(() => ({
  mockTab: vi.fn(),
  mockUI: vi.fn(),
  mockLeave: vi.fn(),
}))
vi.mock('./use-quiz-active-tab', () => ({ useQuizActiveTab: (...a: unknown[]) => mockTab(...a) }))
vi.mock('./use-quiz-ui', () => ({ useQuizUI: (...a: unknown[]) => mockUI(...a) }))
vi.mock('./use-quiz-leave-guard', () => ({
  useQuizLeaveGuard: (...a: unknown[]) => mockLeave(...a),
}))

import { useQuizRunnerUI } from './use-quiz-runner-ui'
import type { QuizState } from './use-quiz-state'

const setShowFinishDialog = vi.fn()
const baseState = {
  currentIndex: 2,
  isExam: false,
  feedback: new Map(),
  existingAnswer: undefined,
  submitted: { current: false },
  setShowFinishDialog,
} as unknown as QuizState

beforeEach(() => {
  vi.resetAllMocks()
  mockTab.mockReturnValue({ activeTab: 'explanation', setActiveTab: vi.fn() })
  mockUI.mockReturnValue({ pendingOptionId: 'opt-1', feedbackMap: new Map() })
  mockLeave.mockReturnValue({ pendingSelection: true })
})

describe('useQuizRunnerUI', () => {
  it('shows the chosen tab in study mode', () => {
    const { result } = renderHook(() =>
      useQuizRunnerUI(baseState, { isDiscovery: false, sessionId: 'sess-1' }),
    )
    expect(result.current.effectiveTab).toBe('explanation')
    expect(mockUI).toHaveBeenCalledWith(expect.objectContaining({ activeTab: 'explanation' }))
  })

  it('pins the question tab in an exam', () => {
    const exam = { ...baseState, isExam: true } as QuizState
    const { result } = renderHook(() =>
      useQuizRunnerUI(exam, { isDiscovery: false, sessionId: 'sess-1' }),
    )
    expect(result.current.effectiveTab).toBe('question')
    expect(result.current.activeTab).toBe('explanation')
  })

  it('feeds the leave guard the picked-but-unsubmitted option and the discovery flag', () => {
    const { result } = renderHook(() =>
      useQuizRunnerUI(baseState, { isDiscovery: true, sessionId: 'sess-1' }),
    )
    expect(mockLeave).toHaveBeenCalledWith(
      expect.objectContaining({
        isDiscovery: true,
        sessionId: 'sess-1',
        pendingOptionId: 'opt-1',
        setShowFinishDialog,
      }),
    )
    expect(result.current.leave.pendingSelection).toBe(true)
  })
})
