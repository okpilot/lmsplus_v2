import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { buildPersistenceNavigation } from './build-persistence-navigation'

// ---- Fixtures ---------------------------------------------------------------

function makeRef<T>(value: T): { current: T } {
  return { current: value }
}

function makeDraftAnswer(): DraftAnswer {
  return { selectedOptionId: 'opt-a', responseTimeMs: 300 }
}

function makeFeedback(): AnswerFeedback {
  return {
    isCorrect: true,
    correctOptionId: 'opt-a',
    explanationText: null,
    explanationImageUrl: null,
  }
}

function makeOpts(overrides?: Partial<Parameters<typeof buildPersistenceNavigation>[0]>) {
  const checkpoint = vi.fn()
  const navigateTo = vi.fn()
  const getCurrentIndex = vi.fn(() => 0)
  const clearAnswerError = vi.fn()
  const clearSubmitError = vi.fn()
  const answersRef = makeRef(new Map<string, DraftAnswer>())
  const feedbackRef = makeRef(new Map<string, AnswerFeedback>())
  const pendingQuestionIdRef = makeRef(new Set<string>())

  return {
    checkpoint,
    navigateTo,
    getCurrentIndex,
    clearAnswerError,
    clearSubmitError,
    answersRef,
    feedbackRef,
    pendingQuestionIdRef,
    ...overrides,
  }
}

// ---- Lifecycle ---------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- return shape -----------------------------------------------------------

describe('buildPersistenceNavigation — return shape', () => {
  it('returns the original checkpoint function unchanged', () => {
    const opts = makeOpts()
    const result = buildPersistenceNavigation(opts)
    expect(result.checkpoint).toBe(opts.checkpoint)
  })

  it('returns wrapped navigateTo (not the original reference)', () => {
    const opts = makeOpts()
    const result = buildPersistenceNavigation(opts)
    expect(result.navigateTo).not.toBe(opts.navigateTo)
  })

  it('returns a navigate function', () => {
    const opts = makeOpts()
    const result = buildPersistenceNavigation(opts)
    expect(typeof result.navigate).toBe('function')
  })
})

// ---- wrappedNavigateTo — side effects before checkpoint ---------------------

describe('buildPersistenceNavigation — wrappedNavigateTo call ordering', () => {
  it('clears answer error before calling navigateTo', () => {
    const order: string[] = []
    const opts = makeOpts({
      clearAnswerError: vi.fn(() => {
        order.push('clearAnswerError')
      }),
      navigateTo: vi.fn(() => {
        order.push('navigateTo')
      }),
    })
    buildPersistenceNavigation(opts).navigateTo(2)
    expect(order.indexOf('clearAnswerError')).toBeLessThan(order.indexOf('navigateTo'))
  })

  it('clears submit error before calling navigateTo', () => {
    const order: string[] = []
    const opts = makeOpts({
      clearSubmitError: vi.fn(() => {
        order.push('clearSubmitError')
      }),
      navigateTo: vi.fn(() => {
        order.push('navigateTo')
      }),
    })
    buildPersistenceNavigation(opts).navigateTo(2)
    expect(order.indexOf('clearSubmitError')).toBeLessThan(order.indexOf('navigateTo'))
  })

  it('calls navigateTo with the target index', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(3)
    expect(opts.navigateTo).toHaveBeenCalledWith(3)
  })

  it('calls clearAnswerError exactly once per navigation', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.clearAnswerError).toHaveBeenCalledTimes(1)
  })

  it('calls clearSubmitError exactly once per navigation', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.clearSubmitError).toHaveBeenCalledTimes(1)
  })
})

// ---- checkpoint — no pending questions --------------------------------------

describe('buildPersistenceNavigation — checkpoint with no pending questions', () => {
  it('checkpoints with the full answersRef.current when pendingQuestionIdRef is empty', () => {
    const answers = new Map([['q1', makeDraftAnswer()]])
    const feedback = new Map([['q1', makeFeedback()]])
    const opts = makeOpts({
      answersRef: makeRef(answers),
      feedbackRef: makeRef(feedback),
      pendingQuestionIdRef: makeRef(new Set<string>()),
    })
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.checkpoint).toHaveBeenCalledWith(answers, 1, feedback)
  })

  it('passes the target index to checkpoint', () => {
    const opts = makeOpts()
    buildPersistenceNavigation(opts).navigateTo(4)
    expect(opts.checkpoint).toHaveBeenCalledWith(expect.anything(), 4, expect.anything())
  })
})

// ---- checkpoint — with pending questions ------------------------------------

describe('buildPersistenceNavigation — checkpoint stripping pending questions', () => {
  it('strips pending question IDs from answers before checkpointing', () => {
    const answers = new Map([
      ['q1', makeDraftAnswer()],
      ['q-pending', makeDraftAnswer()],
    ])
    const opts = makeOpts({
      answersRef: makeRef(answers),
      pendingQuestionIdRef: makeRef(new Set(['q-pending'])),
    })
    buildPersistenceNavigation(opts).navigateTo(1)

    const checkpointMock = vi.mocked(opts.checkpoint)
    const [checkpointedAnswers] = checkpointMock.mock.calls[0] as [Map<string, DraftAnswer>]
    expect(checkpointedAnswers.has('q1')).toBe(true)
    expect(checkpointedAnswers.has('q-pending')).toBe(false)
  })

  it('does not mutate the original answersRef.current when stripping pending questions', () => {
    const answers = new Map([
      ['q1', makeDraftAnswer()],
      ['q-pending', makeDraftAnswer()],
    ])
    const opts = makeOpts({
      answersRef: makeRef(answers),
      pendingQuestionIdRef: makeRef(new Set(['q-pending'])),
    })
    buildPersistenceNavigation(opts).navigateTo(1)
    // original map must be unaffected
    expect(answers.has('q-pending')).toBe(true)
    expect(answers.size).toBe(2)
  })

  it('passes a safe copy (not the same reference) to checkpoint when pending IDs exist', () => {
    const answers = new Map([['q-pending', makeDraftAnswer()]])
    const opts = makeOpts({
      answersRef: makeRef(answers),
      pendingQuestionIdRef: makeRef(new Set(['q-pending'])),
    })
    buildPersistenceNavigation(opts).navigateTo(0)
    const checkpointMock2 = vi.mocked(opts.checkpoint)
    const [checkpointedAnswers] = checkpointMock2.mock.calls[0] as [Map<string, DraftAnswer>]
    expect(checkpointedAnswers).not.toBe(answers)
  })

  it('strips multiple pending question IDs in one navigation', () => {
    const answers = new Map([
      ['q1', makeDraftAnswer()],
      ['p1', makeDraftAnswer()],
      ['p2', makeDraftAnswer()],
    ])
    const opts = makeOpts({
      answersRef: makeRef(answers),
      pendingQuestionIdRef: makeRef(new Set(['p1', 'p2'])),
    })
    buildPersistenceNavigation(opts).navigateTo(2)
    const checkpointMock3 = vi.mocked(opts.checkpoint)
    const [checkpointedAnswers] = checkpointMock3.mock.calls[0] as [Map<string, DraftAnswer>]
    expect(checkpointedAnswers.size).toBe(1)
    expect(checkpointedAnswers.has('q1')).toBe(true)
  })

  it('passes feedbackRef.current to checkpoint even when pending questions exist', () => {
    const feedback = new Map([['q1', makeFeedback()]])
    const opts = makeOpts({
      feedbackRef: makeRef(feedback),
      pendingQuestionIdRef: makeRef(new Set(['q-pending'])),
      answersRef: makeRef(new Map([['q-pending', makeDraftAnswer()]])),
    })
    buildPersistenceNavigation(opts).navigateTo(1)
    expect(opts.checkpoint).toHaveBeenCalledWith(expect.anything(), 1, feedback)
  })
})

// ---- wrappedNavigate --------------------------------------------------------

describe('buildPersistenceNavigation — wrappedNavigate (relative)', () => {
  it('navigates to getCurrentIndex() + delta', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 3) })
    buildPersistenceNavigation(opts).navigate(2)
    expect(opts.navigateTo).toHaveBeenCalledWith(5)
  })

  it('navigates backwards with a negative delta', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 4) })
    buildPersistenceNavigation(opts).navigate(-1)
    expect(opts.navigateTo).toHaveBeenCalledWith(3)
  })

  it('calls clearAnswerError and clearSubmitError on relative navigation', () => {
    const opts = makeOpts({ getCurrentIndex: vi.fn(() => 0) })
    buildPersistenceNavigation(opts).navigate(1)
    expect(opts.clearAnswerError).toHaveBeenCalledTimes(1)
    expect(opts.clearSubmitError).toHaveBeenCalledTimes(1)
  })
})
