import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  state: vi.fn(),
  ui: vi.fn(),
  flags: vi.fn(),
  timer: vi.fn(),
  kb: vi.fn(),
}))
vi.mock('./use-quiz-state', () => ({ useQuizState: (...a: unknown[]) => m.state(...a) }))
vi.mock('./use-quiz-runner-ui', () => ({ useQuizRunnerUI: (...a: unknown[]) => m.ui(...a) }))
vi.mock('./use-flagged-questions', () => ({
  useFlaggedQuestions: (...a: unknown[]) => m.flags(...a),
}))
vi.mock('./use-quiz-timer', () => ({ useQuizTimer: (...a: unknown[]) => m.timer(...a) }))
vi.mock('./use-unblocked-quiz-keyboard', () => ({
  useUnblockedQuizKeyboard: (...a: unknown[]) => m.kb(...a),
}))

import type { QuizSessionProps } from '../../session-types'
import { useQuizSession } from './use-quiz-session'

const setActiveTab = vi.fn()
const navigate = vi.fn()
const handleSelectAnswer = vi.fn()
const setShowFinishDialog = vi.fn()

function state(over: Record<string, unknown> = {}) {
  return {
    question: { options: [{ id: 'a' }, { id: 'b' }] },
    currentIndex: 1,
    isExam: false,
    showFinishDialog: false,
    navigate,
    handleSelectAnswer,
    setShowFinishDialog,
    ...over,
  }
}

function props(over: Record<string, unknown> = {}) {
  return { mode: 'study', questions: [], startedAt: 'T', ...over } as unknown as QuizSessionProps
}

function run(s: ReturnType<typeof state>, p = props(), discoveryConfirmOpen = false) {
  m.state.mockReturnValue(s)
  m.ui.mockReturnValue({ leave: { discoveryConfirmOpen }, setActiveTab })
  return renderHook(() => useQuizSession(p))
}

const kbArgs = () => m.kb.mock.calls[0]?.[0] as Record<string, unknown>

beforeEach(() => {
  vi.resetAllMocks()
  m.flags.mockReturnValue({})
  m.timer.mockReturnValue({})
  m.kb.mockReturnValue({ highlightedOptionId: 'b' })
})

describe('useQuizSession', () => {
  it('returns the keyboard highlight and flags discovery mode', () => {
    const { result } = run(state(), props({ mode: 'discovery' }))
    expect(result.current.highlightedOptionId).toBe('b')
    expect(result.current.isDiscovery).toBe(true)
  })

  it('passes the current question option ids to the keyboard', () => {
    run(state())
    expect(kbArgs()).toMatchObject({ optionIds: ['a', 'b'], currentIndex: 1, isExam: false })
  })

  it('passes an empty option list when there is no question', () => {
    run(state({ question: undefined }))
    expect(kbArgs().optionIds).toEqual([])
  })

  it('enables shortcuts when no dialog is open', () => {
    run(state())
    expect(kbArgs().enabled).toBe(true)
  })

  it('pauses shortcuts while the finish dialog is open', () => {
    run(state({ showFinishDialog: true }))
    expect(kbArgs().enabled).toBe(false)
  })

  it('pauses shortcuts while the discovery leave dialog is open', () => {
    run(state(), props(), true)
    expect(kbArgs().enabled).toBe(false)
  })

  it('defaults flagged ids to an empty list', () => {
    run(state())
    expect(m.flags).toHaveBeenCalledWith([])
  })

  it('seeds flags from initialFlaggedIds', () => {
    run(state(), props({ initialFlaggedIds: ['q1'] }))
    expect(m.flags).toHaveBeenCalledWith(['q1'])
  })

  it('wires the timer to open the finish dialog', () => {
    run(state(), props({ startedAt: 'X' }))
    expect(m.timer).toHaveBeenCalledWith('X', setShowFinishDialog)
  })
})
