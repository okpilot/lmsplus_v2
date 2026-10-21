import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoad, mockRedirect, mockQuestions, mockVfrQuestions, mockFlags, mockFeedback } =
  vi.hoisted(() => ({
    mockFeedback: vi.fn(),
    mockLoad: vi.fn(),
    mockQuestions: vi.fn(),
    mockVfrQuestions: vi.fn(),
    mockFlags: vi.fn(),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`)
    }),
  }))

vi.mock('@/lib/queries/load-quiz-session-state', () => ({
  loadQuizSessionState: (...a: unknown[]) => mockLoad(...a),
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: (...a: unknown[]) => mockQuestions(...a),
}))
vi.mock('@/lib/queries/load-vfr-rt-exam-questions', () => ({
  loadVfrRtExamQuestions: (...a: unknown[]) => mockVfrQuestions(...a),
}))
vi.mock('@/lib/queries/restored-feedback', () => ({
  getRestoredFeedbackBounded: (...a: unknown[]) => mockFeedback(...a),
}))
vi.mock('@/lib/queries/flagged-questions', () => ({
  getFlaggedQuestionIdsBounded: (...a: unknown[]) => mockFlags(...a),
}))

import { loadSessionEntry } from './load-session-entry'

const ID = '11111111-1111-4111-8111-111111111111'

const Q = [{ id: 'q1' }, { id: 'q2' }]
const FB = { questionType: 'multiple_choice', isCorrect: true }
const open = (mode: string) => ({
  kind: 'open',
  sessionId: ID,
  mode,
  questionIds: ['q1', 'q2'],
  seed: { answers: { q1: { selectedOptionId: 'a' } } },
})

beforeEach(() => {
  vi.resetAllMocks()
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
  mockQuestions.mockResolvedValue({ success: true, questions: Q })
  mockVfrQuestions.mockResolvedValue({ success: true, questions: Q })
  mockFlags.mockResolvedValue(['q1'])
  mockFeedback.mockResolvedValue({ q1: FB })
})

afterEach(() => vi.useRealTimers())

describe('loadSessionEntry', () => {
  it('asks for this student own session by id', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))

    await loadSessionEntry(ID, 'user-1')

    expect(mockLoad).toHaveBeenCalledWith(ID, 'user-1')
  })

  it('returns a saved session without loading questions', async () => {
    const state = { kind: 'saved', sessionId: ID, mode: 'quick_quiz', questionIds: ['q1'] }
    mockLoad.mockResolvedValue(state)

    expect(await loadSessionEntry(ID, 'user-1')).toEqual({ entry: state, runner: null })
    expect(mockQuestions).not.toHaveBeenCalled()
    expect(mockFlags).not.toHaveBeenCalled()
  })

  it('returns an open session with its questions and flags', async () => {
    const state = open('quick_quiz')
    mockLoad.mockResolvedValue(state)

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded).toEqual({
      entry: state,
      runner: { questions: Q, flaggedIds: ['q1'], feedback: { q1: FB } },
    })
    expect(mockQuestions).toHaveBeenCalledWith(['q1', 'q2'])
    expect(mockFlags).toHaveBeenCalledWith(['q1', 'q2'])
  })

  it('reads the restored feedback of a practice session by its id', async () => {
    mockLoad.mockResolvedValue(open('smart_review'))

    await loadSessionEntry(ID, 'user-1')

    expect(mockFeedback).toHaveBeenCalledWith(ID)
  })

  it('leaves out feedback for a served question the student has not answered', async () => {
    mockLoad.mockResolvedValue(open('smart_review'))
    mockFeedback.mockResolvedValue({ q1: FB, q2: { ...FB, isCorrect: false } })

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toMatchObject({ feedback: { q1: FB } })
    expect((loaded.runner as { feedback: object }).feedback).not.toHaveProperty('q2')
  })

  it.each(['mock_exam', 'internal_exam', 'vfr_rt_exam'])(
    'does not read restored feedback for a %s session',
    async (mode) => {
      mockLoad.mockResolvedValue(open(mode))

      const loaded = await loadSessionEntry(ID, 'user-1')

      expect(mockFeedback).not.toHaveBeenCalled()
      expect(loaded.runner).toMatchObject({ feedback: {} })
    },
  )

  it('still loads the questions when the restored feedback read yields nothing', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockFeedback.mockResolvedValue({})

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: ['q1'], feedback: {} })
  })

  it('reports the questions error without waiting on a hung feedback read', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockResolvedValue({ success: false, error: 'No questions found' })
    mockFeedback.mockReturnValue(new Promise(() => undefined))
    vi.useFakeTimers()

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ error: 'No questions found' })
  })

  it('loads a VFR RT exam through its session-keyed loader', async () => {
    mockLoad.mockResolvedValue(open('vfr_rt_exam'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(mockVfrQuestions).toHaveBeenCalledWith({ sessionId: ID })
    expect(mockQuestions).not.toHaveBeenCalled()
    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: ['q1'], feedback: {} })
  })

  it('reads flags for an internal exam so the grid shows them', async () => {
    mockLoad.mockResolvedValue(open('internal_exam'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(mockFlags).toHaveBeenCalled()
    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: ['q1'], feedback: {} })
  })

  it('reports the questions error without waiting on a hung flag read', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockResolvedValue({ success: false, error: 'No questions found' })
    mockFlags.mockReturnValue(new Promise(() => undefined))
    // Fake timers never fire the flag timeout: a loader that awaits flags first hangs.
    vi.useFakeTimers()

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ error: 'No questions found' })
  })

  it('reports a generic error when the questions read rejects', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockRejectedValue(new Error('boom'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ error: 'Failed to load questions. Please try again.' })
  })

  it('logs the failure when the questions read rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockRejectedValue(new Error('boom'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0]?.[0]).startsWith('[loadSessionEntry]')).toBe(true)
    expect(errorSpy.mock.calls[0]).toContain('boom')
    expect(loaded.runner).toEqual({ error: 'Failed to load questions. Please try again.' })
  })

  it.each([
    ['quick_quiz', `/app/quiz/report?session=${ID}`],
    ['smart_review', `/app/quiz/report?session=${ID}`],
    ['mock_exam', `/app/quiz/report?session=${ID}`],
    ['internal_exam', `/app/internal-exam/report?session=${ID}`],
    ['vfr_rt_exam', `/app/vfr-rt/report?session=${ID}`],
  ])('sends a finished %s session to its report', async (mode, url) => {
    mockLoad.mockResolvedValue({ kind: 'ended', mode })

    await expect(loadSessionEntry(ID, 'user-1')).rejects.toThrow(`NEXT_REDIRECT:${url}`)
  })

  it.each(['discarded', 'not_found'])('sends a %s session back to the quiz page', async (kind) => {
    mockLoad.mockResolvedValue({ kind })

    await expect(loadSessionEntry(ID, 'user-1')).rejects.toThrow('NEXT_REDIRECT:/app/quiz')
  })
})
