import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockCheckAnswer, mockCheckNonMcAnswer } = vi.hoisted(() => ({
  mockCheckAnswer: vi.fn(),
  mockCheckNonMcAnswer: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...args: unknown[]) => mockCheckAnswer(...args),
}))

vi.mock('../../actions/check-non-mc-answer', () => ({
  checkNonMcAnswer: (...args: unknown[]) => mockCheckNonMcAnswer(...args),
}))

// ---- Subject under test ----------------------------------------------------

import type { AnswerFeedback } from '../../types'
import type { AttemptInput } from './answer-handler-helpers'
import { buildAnswerHandlers, recordAnswerFeedback } from './answer-handler-helpers'

// ---- Fixtures --------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-b000-000000000001'
const Q_ID = '00000000-0000-4000-b000-000000000011'

const MC_SUCCESS = {
  success: true as const,
  isCorrect: true,
  correctOptionId: 'opt-a',
  explanationText: 'Lift formula',
  explanationImageUrl: null,
}

const SA_SUCCESS = {
  success: true as const,
  questionType: 'short_answer' as const,
  isCorrect: true,
  correctAnswer: 'cleared to land',
  explanationText: null,
  explanationImageUrl: null,
}

const DF_SUCCESS = {
  success: true as const,
  questionType: 'dialog_fill' as const,
  isCorrect: false,
  blanks: [
    { index: 0, isCorrect: true, canonical: 'alpha' },
    { index: 1, isCorrect: false, canonical: '27' },
  ],
  explanationText: null,
  explanationImageUrl: null,
}

const ORD_SUCCESS = {
  success: true as const,
  questionType: 'ordering' as const,
  isCorrect: true,
  correctOrder: ['mayday', 'callsign', 'intentions'],
  explanationText: null,
  explanationImageUrl: null,
}

// ---- Helpers ---------------------------------------------------------------

function makeHandlers() {
  const capturedAttempts: AttemptInput[] = []
  const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
    capturedAttempts.push(input)
    // Execute the check closure to exercise the actual Server Action wrapping logic
    await input.check(Q_ID)
    return true
  })
  const handlers = buildAnswerHandlers({
    sessionId: SESSION_ID,
    getAnswerStartTime: () => Date.now() - 500,
    runAttempt,
  })
  return { handlers, runAttempt, capturedAttempts }
}

// ---- Lifecycle -------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- buildAnswerHandlers — handleSelectAnswer --------------------------------

describe('buildAnswerHandlers — handleSelectAnswer', () => {
  it('records the selected option as the draft answer', async () => {
    mockCheckAnswer.mockResolvedValue(MC_SUCCESS)
    const { handlers, capturedAttempts } = makeHandlers()

    await handlers.handleSelectAnswer('opt-a')

    expect(capturedAttempts).toHaveLength(1)
    expect(capturedAttempts[0]?.draft).toMatchObject({ selectedOptionId: 'opt-a' })
  })

  it('calls checkAnswer with questionId, optionId, and sessionId', async () => {
    mockCheckAnswer.mockResolvedValue(MC_SUCCESS)
    const { handlers } = makeHandlers()

    await handlers.handleSelectAnswer('opt-b')

    expect(mockCheckAnswer).toHaveBeenCalledWith({
      questionId: Q_ID,
      selectedOptionId: 'opt-b',
      sessionId: SESSION_ID,
    })
  })

  it('returns multiple-choice feedback for a selected option', async () => {
    mockCheckAnswer.mockResolvedValue(MC_SUCCESS)
    const { capturedAttempts } = makeHandlers()
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      capturedAttempts.push(input)
      const result = await input.check(Q_ID)
      expect(result.questionType).toBe('multiple_choice')
      expect(result.isCorrect).toBe(true)
      return true
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleSelectAnswer('opt-a')
  })

  it('throws when checkAnswer returns success: false', async () => {
    mockCheckAnswer.mockResolvedValue({ success: false, error: 'Session not found' })
    const { handlers, runAttempt } = makeHandlers()

    // runAttempt itself will throw because the check closure throws
    runAttempt.mockImplementationOnce(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('Session not found')
      return false
    })

    await handlers.handleSelectAnswer('opt-a')
  })
})

// ---- buildAnswerHandlers — handleTextAnswer ---------------------------------

describe('buildAnswerHandlers — handleTextAnswer', () => {
  it('records the typed text as the draft answer', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(SA_SUCCESS)
    const { handlers, capturedAttempts } = makeHandlers()

    await handlers.handleTextAnswer('cleared to land')

    expect(capturedAttempts).toHaveLength(1)
    expect(capturedAttempts[0]?.draft).toMatchObject({ responseText: 'cleared to land' })
  })

  it('calls checkNonMcAnswer with questionId, sessionId, and responseText', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(SA_SUCCESS)
    const { handlers } = makeHandlers()

    await handlers.handleTextAnswer('roger')

    expect(mockCheckNonMcAnswer).toHaveBeenCalledWith({
      questionId: Q_ID,
      sessionId: SESSION_ID,
      responseText: 'roger',
    })
  })

  it('returns short-answer feedback after a successful check', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(SA_SUCCESS)
    let capturedResult: AnswerFeedback | null = null
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      capturedResult = await input.check(Q_ID)
      return true
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleTextAnswer('cleared to land')

    expect(capturedResult).not.toBeNull()
    expect((capturedResult as AnswerFeedback | null)?.questionType).toBe('short_answer')
    expect((capturedResult as { correctAnswer?: string | null } | null)?.correctAnswer).toBe(
      'cleared to land',
    )
  })

  it('throws when checkNonMcAnswer returns success: false', async () => {
    mockCheckNonMcAnswer.mockResolvedValue({ success: false, error: 'Could not check answer' })
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleTextAnswer('wrong')
  })

  it('throws when checkNonMcAnswer returns wrong questionType', async () => {
    // Returns dialog_fill when we called for short_answer — should throw
    mockCheckNonMcAnswer.mockResolvedValue(DF_SUCCESS)
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleTextAnswer('wrong')
  })
})

// ---- buildAnswerHandlers — handleDialogFillAnswer ---------------------------

describe('buildAnswerHandlers — handleDialogFillAnswer', () => {
  const BLANK_ANSWERS = [
    { index: 0, text: 'alpha' },
    { index: 1, text: '27' },
  ]

  it('records the dialog blanks as the draft answer', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(DF_SUCCESS)
    const { handlers, capturedAttempts } = makeHandlers()

    await handlers.handleDialogFillAnswer(BLANK_ANSWERS)

    expect(capturedAttempts).toHaveLength(1)
    expect(capturedAttempts[0]?.draft).toMatchObject({ blankAnswers: BLANK_ANSWERS })
  })

  it('calls checkNonMcAnswer with questionId, sessionId, and blankAnswers', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(DF_SUCCESS)
    const { handlers } = makeHandlers()

    await handlers.handleDialogFillAnswer(BLANK_ANSWERS)

    expect(mockCheckNonMcAnswer).toHaveBeenCalledWith({
      questionId: Q_ID,
      sessionId: SESSION_ID,
      blankAnswers: BLANK_ANSWERS,
    })
  })

  it('returns dialog-fill feedback with per-blank results', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(DF_SUCCESS)
    let capturedResult: AnswerFeedback | null = null
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      capturedResult = await input.check(Q_ID)
      return true
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleDialogFillAnswer(BLANK_ANSWERS)

    expect(capturedResult).not.toBeNull()
    expect((capturedResult as AnswerFeedback | null)?.questionType).toBe('dialog_fill')
    const blanks = (capturedResult as { blanks?: unknown[] } | null)?.blanks
    expect(blanks).toHaveLength(2)
  })

  it('throws when checkNonMcAnswer returns success: false', async () => {
    mockCheckNonMcAnswer.mockResolvedValue({ success: false, error: 'Could not check answer' })
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleDialogFillAnswer(BLANK_ANSWERS)
  })

  it('throws when checkNonMcAnswer returns wrong questionType', async () => {
    // Returns short_answer when we called for dialog_fill — should throw
    mockCheckNonMcAnswer.mockResolvedValue(SA_SUCCESS)
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleDialogFillAnswer(BLANK_ANSWERS)
  })
})

// ---- recordAnswerFeedback ---------------------------------------------------

describe('recordAnswerFeedback', () => {
  it('adds the result to the feedback map and updates feedbackRef', () => {
    const initial = new Map<string, AnswerFeedback>()
    const feedbackRef = { current: initial } as React.MutableRefObject<Map<string, AnswerFeedback>>
    const setFeedback = vi.fn()
    const result: AnswerFeedback = {
      questionType: 'multiple_choice',
      isCorrect: true,
      correctOptionId: 'opt-a',
      explanationText: null,
      explanationImageUrl: null,
    }

    const returned = recordAnswerFeedback(Q_ID, result, feedbackRef, setFeedback)

    expect(returned.get(Q_ID)).toEqual(result)
    expect(feedbackRef.current.get(Q_ID)).toEqual(result)
    expect(setFeedback).toHaveBeenCalledWith(returned)
  })

  it('preserves existing entries when adding a new one', () => {
    const existing: AnswerFeedback = {
      questionType: 'short_answer',
      isCorrect: false,
      correctAnswer: 'answer',
      explanationText: null,
      explanationImageUrl: null,
    }
    const initial = new Map<string, AnswerFeedback>([['other-q', existing]])
    const feedbackRef = { current: initial } as React.MutableRefObject<Map<string, AnswerFeedback>>
    const setFeedback = vi.fn()
    const newResult: AnswerFeedback = {
      questionType: 'multiple_choice',
      isCorrect: true,
      correctOptionId: 'opt-b',
      explanationText: null,
      explanationImageUrl: null,
    }

    const returned = recordAnswerFeedback(Q_ID, newResult, feedbackRef, setFeedback)

    expect(returned.size).toBe(2)
    expect(returned.get('other-q')).toEqual(existing)
    expect(returned.get(Q_ID)).toEqual(newResult)
  })

  it('stores dialog-fill feedback with per-blank results', () => {
    const initial = new Map<string, AnswerFeedback>()
    const feedbackRef = { current: initial } as React.MutableRefObject<Map<string, AnswerFeedback>>
    const setFeedback = vi.fn()
    const result: AnswerFeedback = {
      questionType: 'dialog_fill',
      isCorrect: false,
      blanks: [{ index: 0, isCorrect: false, canonical: '27' }],
      explanationText: null,
      explanationImageUrl: null,
    }

    recordAnswerFeedback(Q_ID, result, feedbackRef, setFeedback)

    const stored = feedbackRef.current.get(Q_ID)
    expect(stored?.questionType).toBe('dialog_fill')
    if (stored?.questionType === 'dialog_fill') {
      expect(stored.blanks).toHaveLength(1)
      expect(stored.blanks[0]?.canonical).toBe('27')
    }
  })
})

// ---- buildAnswerHandlers — handleOrderingAnswer -----------------------------

describe('buildAnswerHandlers — handleOrderingAnswer', () => {
  const ORDER_PAYLOAD = ['a', 'b', 'c']

  it('stores the submitted ordering for the current question', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(ORD_SUCCESS)
    const { handlers, capturedAttempts } = makeHandlers()

    await handlers.handleOrderingAnswer(ORDER_PAYLOAD)

    expect(capturedAttempts).toHaveLength(1)
    expect(capturedAttempts[0]?.draft).toMatchObject({ order: ORDER_PAYLOAD })
  })

  it('checks the submitted ordering for the current question', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(ORD_SUCCESS)
    const { handlers } = makeHandlers()

    await handlers.handleOrderingAnswer(ORDER_PAYLOAD)

    expect(mockCheckNonMcAnswer).toHaveBeenCalledWith({
      questionId: Q_ID,
      sessionId: SESSION_ID,
      order: ORDER_PAYLOAD,
    })
  })

  it('returns ordering feedback with the canonical order', async () => {
    mockCheckNonMcAnswer.mockResolvedValue(ORD_SUCCESS)
    let capturedResult: AnswerFeedback | null = null
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      capturedResult = await input.check(Q_ID)
      return true
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleOrderingAnswer(ORDER_PAYLOAD)

    expect(capturedResult).not.toBeNull()
    expect((capturedResult as AnswerFeedback | null)?.questionType).toBe('ordering')
    expect((capturedResult as AnswerFeedback | null)?.isCorrect).toBe(true)
    const correctOrder = (capturedResult as { correctOrder?: string[] } | null)?.correctOrder
    expect(correctOrder).toEqual(['mayday', 'callsign', 'intentions'])
  })

  it('fails the submission when validation is unsuccessful', async () => {
    mockCheckNonMcAnswer.mockResolvedValue({ success: false, error: 'Could not check answer' })
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleOrderingAnswer(ORDER_PAYLOAD)
  })

  it('rejects non-ordering feedback results', async () => {
    mockCheckNonMcAnswer.mockResolvedValue({ ...ORD_SUCCESS, questionType: 'short_answer' })
    const runAttempt = vi.fn(async (input: AttemptInput): Promise<boolean> => {
      await expect(input.check(Q_ID)).rejects.toThrow('check failed')
      return false
    })
    const handlers = buildAnswerHandlers({
      sessionId: SESSION_ID,
      getAnswerStartTime: () => Date.now(),
      runAttempt,
    })

    await handlers.handleOrderingAnswer(ORDER_PAYLOAD)
  })
})
