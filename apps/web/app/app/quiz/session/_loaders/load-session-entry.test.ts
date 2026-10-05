import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoad, mockRedirect } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/queries/load-quiz-session-state', () => ({
  loadQuizSessionState: (...a: unknown[]) => mockLoad(...a),
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { loadSessionEntry } from './load-session-entry'

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.clearAllMocks())

describe('loadSessionEntry', () => {
  it('asks for this student own session by id', async () => {
    mockLoad.mockResolvedValue({ kind: 'open' })

    await loadSessionEntry(ID, 'user-1')

    expect(mockLoad).toHaveBeenCalledWith(ID, 'user-1')
  })

  it.each(['open', 'saved'])('returns a %s session for rendering', async (kind) => {
    const state = { kind, sessionId: ID }
    mockLoad.mockResolvedValue(state)

    expect(await loadSessionEntry(ID, 'user-1')).toBe(state)
    expect(mockRedirect).not.toHaveBeenCalled()
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
