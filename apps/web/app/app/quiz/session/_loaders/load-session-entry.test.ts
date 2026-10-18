import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoad, mockRedirect, mockQuestions, mockVfrQuestions, mockFlags } = vi.hoisted(() => ({
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
vi.mock('@/lib/queries/flagged-questions', () => ({
  getFlaggedQuestionIds: (...a: unknown[]) => mockFlags(...a),
}))

import { FLAG_FETCH_TIMEOUT_MS } from '@/lib/constants/flag-fetch-timeout'
import { loadSessionEntry } from './load-session-entry'

const ID = '11111111-1111-4111-8111-111111111111'

const Q = [{ id: 'q1' }, { id: 'q2' }]
const open = (mode: string) => ({ kind: 'open', sessionId: ID, mode, questionIds: ['q1', 'q2'] })

beforeEach(() => {
  vi.resetAllMocks()
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  })
  mockQuestions.mockResolvedValue({ success: true, questions: Q })
  mockVfrQuestions.mockResolvedValue({ success: true, questions: Q })
  mockFlags.mockResolvedValue(['q1'])
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

    expect(loaded).toEqual({ entry: state, runner: { questions: Q, flaggedIds: ['q1'] } })
    expect(mockQuestions).toHaveBeenCalledWith(['q1', 'q2'])
    expect(mockFlags).toHaveBeenCalledWith(['q1', 'q2'])
  })

  it('loads a VFR RT exam through its session-keyed loader', async () => {
    mockLoad.mockResolvedValue(open('vfr_rt_exam'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(mockVfrQuestions).toHaveBeenCalledWith({ sessionId: ID })
    expect(mockQuestions).not.toHaveBeenCalled()
    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: ['q1'] })
  })

  it('reads flags for an internal exam so the grid shows them', async () => {
    mockLoad.mockResolvedValue(open('internal_exam'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(mockFlags).toHaveBeenCalled()
    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: ['q1'] })
  })

  it('reports the questions error without waiting on a hung flag read', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockResolvedValue({ success: false, error: 'No questions found' })
    mockFlags.mockReturnValue(new Promise(() => undefined))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ error: 'No questions found' })
  })

  it('reports a generic error when the questions read rejects', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockQuestions.mockRejectedValue(new Error('boom'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ error: 'Failed to load questions. Please try again.' })
  })

  it('still returns the questions when the flag read rejects', async () => {
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockFlags.mockRejectedValue(new Error('down'))

    const loaded = await loadSessionEntry(ID, 'user-1')

    expect(loaded.runner).toEqual({ questions: Q, flaggedIds: [] })
  })

  it('returns the questions with no flags when the flag read hangs', async () => {
    vi.useFakeTimers()
    mockLoad.mockResolvedValue(open('quick_quiz'))
    mockFlags.mockReturnValue(new Promise(() => undefined))

    const pending = loadSessionEntry(ID, 'user-1')
    await vi.advanceTimersByTimeAsync(FLAG_FETCH_TIMEOUT_MS)

    expect((await pending).runner).toEqual({ questions: Q, flaggedIds: [] })
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
