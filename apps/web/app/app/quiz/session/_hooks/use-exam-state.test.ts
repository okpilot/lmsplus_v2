import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAnswer, QuizStateOpts } from '../../types'

// ---- Mocks ----------------------------------------------------------------

// answersRef.current must alias answers — that's the production invariant
// (use-exam-answer-buffer keeps the ref pointing at the live Map). Keeping the
// mocks aligned prevents buffer-sync regressions from being silently masked.
const { mockConfirmAnswer, mockAnswers, mockAnswersRef } = vi.hoisted(() => {
  const mockAnswers = new Map<string, DraftAnswer>()
  const mockAnswersRef = { current: mockAnswers }
  return {
    mockConfirmAnswer: vi.fn(),
    mockAnswers,
    mockAnswersRef,
  }
})

vi.mock('./use-exam-answer-buffer', () => ({
  useExamAnswerBuffer: () => ({
    answers: mockAnswers,
    answersRef: mockAnswersRef,
    confirmAnswer: mockConfirmAnswer,
  }),
}))

const { mockCheckpoint } = vi.hoisted(() => ({
  mockCheckpoint: vi.fn(),
}))

vi.mock('./use-quiz-persistence', () => ({
  useQuizPersistence: () => ({ checkpoint: mockCheckpoint }),
}))

const {
  mockSubmitted,
  mockHandleSubmit,
  mockHandleSave,
  mockHandleDiscard,
  mockSetShowFinishDialog,
  mockUseQuizSubmit,
} = vi.hoisted(() => {
  const mockSubmitted = { current: false }
  const mockHandleSubmit = vi.fn()
  const mockHandleSave = vi.fn()
  const mockHandleDiscard = vi.fn()
  const mockSetShowFinishDialog = vi.fn()
  const mockUseQuizSubmit = vi.fn()
  return {
    mockSubmitted,
    mockHandleSubmit,
    mockHandleSave,
    mockHandleDiscard,
    mockSetShowFinishDialog,
    mockUseQuizSubmit,
  }
})

vi.mock('./use-quiz-submit', () => ({
  useQuizSubmit: (...args: unknown[]) => mockUseQuizSubmit(...args),
}))

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// ---- Subject under test (after mocks) ------------------------------------

import { useExamPipeline } from './use-exam-state'

// ---- Fixtures ------------------------------------------------------------

const USER_ID = 'user-aaa'
const SESSION_ID = 'sess-bbb'
const Q1 = '00000000-0000-4000-a000-000000000001'

function makeQuizOpts(overrides: Partial<QuizStateOpts> = {}): QuizStateOpts {
  return {
    userId: USER_ID,
    sessionId: SESSION_ID,
    questions: [{ id: Q1 } as QuizStateOpts['questions'][0]],
    draftId: 'draft-1',
    subjectName: 'Meteorology',
    subjectCode: 'MET',
    ...overrides,
  }
}

function makeOpts(quizOptsOverrides: Partial<QuizStateOpts> = {}) {
  return {
    quizOpts: makeQuizOpts(quizOptsOverrides),
    getQuestionId: vi.fn(() => Q1),
    getAnswerStartTime: vi.fn(() => Date.now()),
    currentIndexRef: { current: 0 },
    navigateTo: vi.fn(),
    navigate: vi.fn(),
  }
}

function makeSubmitResult(overrides: Record<string, unknown> = {}) {
  return {
    submitted: mockSubmitted,
    error: null,
    submitting: false,
    handleSubmit: mockHandleSubmit,
    handleSave: mockHandleSave,
    handleDiscard: mockHandleDiscard,
    showFinishDialog: false,
    setShowFinishDialog: mockSetShowFinishDialog,
    clearError: vi.fn(),
    ...overrides,
  }
}

// ---- Lifecycle -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockAnswers.clear()
  mockAnswersRef.current = mockAnswers
  mockUseQuizSubmit.mockReturnValue(makeSubmitResult())
})

// ---- Return shape --------------------------------------------------------

describe('useExamPipeline — return shape', () => {
  it('exposes all expected keys', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    const keys = Object.keys(result.current)
    expect(keys).toContain('answers')
    expect(keys).toContain('feedback')
    expect(keys).toContain('handleSelectAnswer')
    expect(keys).toContain('navigateTo')
    expect(keys).toContain('navigate')
    expect(keys).toContain('submitted')
    expect(keys).toContain('error')
    expect(keys).toContain('submitting')
    expect(keys).toContain('handleSubmit')
    expect(keys).toContain('handleSave')
    expect(keys).toContain('handleDiscard')
    expect(keys).toContain('showFinishDialog')
    expect(keys).toContain('setShowFinishDialog')
  })
})

// ---- feedback is always an empty Map ------------------------------------

describe('useExamPipeline — feedback', () => {
  it('feedback is an empty Map', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.feedback).toBeInstanceOf(Map)
    expect(result.current.feedback.size).toBe(0)
  })

  it('feedback is stable across renders — same Map instance', () => {
    const { result, rerender } = renderHook(() => useExamPipeline(makeOpts()))
    const first = result.current.feedback
    rerender()
    expect(result.current.feedback).toBe(first)
  })
})

// ---- handleSelectAnswer --------------------------------------------------

describe('useExamPipeline — handleSelectAnswer', () => {
  it('returns a Promise', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    const ret = result.current.handleSelectAnswer('opt-x')
    expect(ret).toBeInstanceOf(Promise)
  })

  it('calls confirmAnswer with the provided option id', async () => {
    mockConfirmAnswer.mockReturnValue(true)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    await result.current.handleSelectAnswer('opt-y')
    expect(mockConfirmAnswer).toHaveBeenCalledWith('opt-y')
  })

  it('resolves to the value returned by confirmAnswer', async () => {
    mockConfirmAnswer.mockReturnValue(false)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    const resolved = await result.current.handleSelectAnswer('opt-z')
    expect(resolved).toBe(false)
  })
})

// ---- isExam: true forwarded to useQuizSubmit ----------------------------

describe('useExamPipeline — isExam flag', () => {
  it('passes isExam: true to useQuizSubmit', () => {
    renderHook(() => useExamPipeline(makeOpts()))
    const callArg = mockUseQuizSubmit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(callArg.isExam).toBe(true)
  })
})

// ---- quizOpts fields forwarded to useQuizSubmit -------------------------

describe('useExamPipeline — submission metadata forwarding', () => {
  it.each([
    ['userId', 'u-forwarded'],
    ['sessionId', 'sess-forwarded'],
    ['draftId', 'draft-forwarded'],
    ['subjectName', 'Air Law'],
    ['subjectCode', 'ALW'],
  ] as const)('forwards %s to submission options', (field, value) => {
    renderHook(() => useExamPipeline(makeOpts({ [field]: value } as Partial<QuizStateOpts>)))
    expect(mockUseQuizSubmit).toHaveBeenCalledWith(expect.objectContaining({ [field]: value }))
  })

  it('forwards questions to submission options', () => {
    const questions = [{ id: 'q-forward' }] as QuizStateOpts['questions']
    renderHook(() => useExamPipeline(makeOpts({ questions })))
    expect(mockUseQuizSubmit).toHaveBeenCalledWith(expect.objectContaining({ questions }))
  })
})

// ---- navigation forwarding -----------------------------------------------

describe('useExamPipeline — navigation forwarding', () => {
  it('forwards navigateTo from opts directly', () => {
    const navigateTo = vi.fn()
    const opts = { ...makeOpts(), navigateTo }
    const { result } = renderHook(() => useExamPipeline(opts))
    expect(result.current.navigateTo).toBe(navigateTo)
  })

  it('forwards navigate from opts directly', () => {
    const navigate = vi.fn()
    const opts = { ...makeOpts(), navigate }
    const { result } = renderHook(() => useExamPipeline(opts))
    expect(result.current.navigate).toBe(navigate)
  })
})

// ---- useQuizSubmit return values surfaced --------------------------------

describe('useExamPipeline — submit state surfacing', () => {
  it('surfaces submitting state from useQuizSubmit', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ submitting: true }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.submitting).toBe(true)
  })

  it('surfaces error state from useQuizSubmit', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ error: 'Submission failed' }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.error).toBe('Submission failed')
  })

  it('surfaces showFinishDialog from useQuizSubmit', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ showFinishDialog: true }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.showFinishDialog).toBe(true)
  })

  it('surfaces handleSubmit from useQuizSubmit', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleSubmit).toBe(mockHandleSubmit)
  })

  it('surfaces handleSave from useQuizSubmit', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleSave).toBe(mockHandleSave)
  })

  it('surfaces handleDiscard from useQuizSubmit', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleDiscard).toBe(mockHandleDiscard)
  })

  it('surfaces setShowFinishDialog from useQuizSubmit', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.setShowFinishDialog).toBe(mockSetShowFinishDialog)
  })

  it('surfaces submitted ref from useQuizSubmit', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.submitted).toBe(mockSubmitted)
  })
})

// ---- answers forwarding --------------------------------------------------

describe('useExamPipeline — answers forwarding', () => {
  it('surfaces the answers map from useExamAnswerBuffer', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.answers).toBe(mockAnswers)
  })
})

// ---- persistence ---------------------------------------------------------

describe('useExamPipeline — persistence', () => {
  it('calls checkpoint with mode=exam after a new answer is confirmed', async () => {
    mockConfirmAnswer.mockReturnValue(true)
    const opts = makeOpts()
    const { result } = renderHook(() => useExamPipeline(opts))

    await result.current.handleSelectAnswer('opt-a')

    expect(mockCheckpoint).toHaveBeenCalledTimes(1)
    expect(mockCheckpoint).toHaveBeenCalledWith(
      mockAnswersRef.current,
      opts.currentIndexRef.current,
    )
  })

  it('skips checkpoint when the answer was already locked (confirmAnswer returns false)', async () => {
    mockConfirmAnswer.mockReturnValue(false)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))

    await result.current.handleSelectAnswer('opt-a')

    expect(mockCheckpoint).not.toHaveBeenCalled()
  })
})
