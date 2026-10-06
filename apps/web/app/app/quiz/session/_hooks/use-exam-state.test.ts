import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizStateOpts } from '../../session-types'
import type { DraftAnswer } from '../../types'

// ---- Mocks ----------------------------------------------------------------

// answersRef.current must alias answers — that's the production invariant
// (use-exam-answer-buffer keeps the ref pointing at the live Map). Keeping the
// mocks aligned prevents buffer-sync regressions from being silently masked.
const { mockRecordAnswer, mockAnswers, mockAnswersRef } = vi.hoisted(() => {
  const mockAnswers = new Map<string, DraftAnswer>()
  const mockAnswersRef = { current: mockAnswers }
  return {
    mockRecordAnswer: vi.fn(),
    mockAnswers,
    mockAnswersRef,
  }
})

vi.mock('./use-exam-answer-buffer', () => ({
  useExamAnswerBuffer: () => ({
    answers: mockAnswers,
    answersRef: mockAnswersRef,
    recordAnswer: mockRecordAnswer,
  }),
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
    expect(keys).toContain('handleDiagramLabelAnswer')
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

  it('records the provided option id as the selected option', async () => {
    mockRecordAnswer.mockReturnValue(true)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    await result.current.handleSelectAnswer('opt-y')
    expect(mockRecordAnswer).toHaveBeenCalledWith({ selectedOptionId: 'opt-y' })
  })

  it('resolves to false when the buffer reports the answer already locked', async () => {
    mockRecordAnswer.mockReturnValue(false)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    const resolved = await result.current.handleSelectAnswer('opt-z')
    expect(resolved).toBe(false)
  })
})

// ---- isExam: true forwarded to useQuizSubmit ----------------------------

describe('useExamPipeline — isExam flag', () => {
  it('enables exam mode', () => {
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
  ] as const)('passes %s to the submit hook', (field, value) => {
    renderHook(() => useExamPipeline(makeOpts({ [field]: value } as Partial<QuizStateOpts>)))
    expect(mockUseQuizSubmit).toHaveBeenCalledWith(expect.objectContaining({ [field]: value }))
  })

  it('passes questions to the submit hook', () => {
    const questions = [{ id: 'q-forward' }] as QuizStateOpts['questions']
    renderHook(() => useExamPipeline(makeOpts({ questions })))
    expect(mockUseQuizSubmit).toHaveBeenCalledWith(expect.objectContaining({ questions }))
  })
})

// ---- navigation forwarding -----------------------------------------------

describe('useExamPipeline — navigation forwarding', () => {
  it('exposes the navigateTo callback unchanged', () => {
    const navigateTo = vi.fn()
    const opts = { ...makeOpts(), navigateTo }
    const { result } = renderHook(() => useExamPipeline(opts))
    expect(result.current.navigateTo).toBe(navigateTo)
  })

  it('exposes the navigate callback unchanged', () => {
    const navigate = vi.fn()
    const opts = { ...makeOpts(), navigate }
    const { result } = renderHook(() => useExamPipeline(opts))
    expect(result.current.navigate).toBe(navigate)
  })
})

// ---- useQuizSubmit return values surfaced --------------------------------

describe('useExamPipeline — submit state surfacing', () => {
  it('returns true while submission is pending', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ submitting: true }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.submitting).toBe(true)
  })

  it('surfaces the submission error string', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ error: 'Submission failed' }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.error).toBe('Submission failed')
  })

  it('returns true while the finish dialog is open', () => {
    mockUseQuizSubmit.mockReturnValue(makeSubmitResult({ showFinishDialog: true }))
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.showFinishDialog).toBe(true)
  })

  it('exposes the submit handler that triggers exam submission', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleSubmit).toBe(mockHandleSubmit)
  })

  it('exposes the save-and-exit handler', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleSave).toBe(mockHandleSave)
  })

  it('exposes the discard handler that abandons the session', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.handleDiscard).toBe(mockHandleDiscard)
  })

  it('exposes the setter that controls finish-dialog visibility', () => {
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    expect(result.current.setShowFinishDialog).toBe(mockSetShowFinishDialog)
  })

  it('exposes the submitted ref that tracks whether the exam was submitted', () => {
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

// ---- non-MC handlers -------------------------------------------------------

describe('useExamPipeline — non-MC handlers', () => {
  it.each([
    ['handleTextAnswer', 'cleared to land', { responseText: 'cleared to land' }],
    [
      'handleDialogFillAnswer',
      [{ index: 0, text: 'cleared' }],
      { blankAnswers: [{ index: 0, text: 'cleared' }] },
    ],
    ['handleOrderingAnswer', ['item-a', 'item-b'], { order: ['item-a', 'item-b'] }],
    [
      'handleDiagramLabelAnswer',
      [{ zoneId: 'z1', labelId: 'l1' }],
      { mapping: [{ zoneId: 'z1', labelId: 'l1' }] },
    ],
  ] as const)('%s records the answer', async (key, arg, draft) => {
    mockRecordAnswer.mockReturnValue(true)
    const opts = makeOpts()
    const { result } = renderHook(() => useExamPipeline(opts))
    const handler = result.current[key] as (a: unknown) => Promise<boolean>
    const resolved = await handler(arg)
    expect(resolved).toBe(true)
    expect(mockRecordAnswer).toHaveBeenCalledWith(draft)
  })

  it('resolves false when a non-MC answer is already locked', async () => {
    mockRecordAnswer.mockReturnValue(false)
    const { result } = renderHook(() => useExamPipeline(makeOpts()))
    const resolved = await result.current.handleTextAnswer('again')
    expect(resolved).toBe(false)
  })
})
