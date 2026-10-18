import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { calls, mockClaim, mockRecheck } = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    mockClaim: vi.fn(async () => {
      calls.push('claim')
      return { success: true }
    }),
    mockRecheck: vi.fn(async () => {
      calls.push('recheck')
      return { success: true, feedback: {}, done: true }
    }),
  }
})

vi.mock('../../actions/quiz-progress', () => ({
  claimQuizSession: (...a: unknown[]) => (mockClaim as (...x: unknown[]) => unknown)(...a),
  saveQuizAnswer: vi.fn(),
  saveQuizPosition: vi.fn(),
}))
vi.mock('../../actions/recheck-answers', () => ({
  recheckRestoredAnswers: (...a: unknown[]) => (mockRecheck as (...x: unknown[]) => unknown)(...a),
}))
vi.mock('./quiz-session', async () => {
  const { useRestoredFeedback } = await import('../_hooks/use-restored-feedback')
  return {
    QuizSession: (p: {
      sessionId: string
      initialAnswers: Record<string, { selectedOptionId?: string; responseTimeMs: number }>
    }) => {
      useRestoredFeedback({
        enabled: true,
        sessionId: p.sessionId,
        restorable: p.initialAnswers,
        answers: new Map(),
        feedback: new Map(),
      })
      return <div data-testid="quiz-session" />
    },
  }
})

import type { SessionRunnerData } from '../_loaders/load-session-entry'
import { ServerSessionLoader } from './server-session-loader'

const RUNNER = {
  questions: [{ id: 'q1' }],
  flaggedIds: [],
} as unknown as SessionRunnerData
const ENTRY = {
  kind: 'open' as const,
  sessionId: 's1',
  mode: 'quick_quiz' as const,
  questionIds: ['q1'],
  startedAt: '2026-10-01T10:00:00.000Z',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  seed: {
    answers: { q1: { selectedOptionId: 'a', responseTimeMs: 5 } },
    activeMs: 0,
    pinnedQuestionIds: [],
    currentIndex: 0,
  },
}

beforeEach(() => {
  calls.length = 0
  mockClaim.mockClear()
  mockRecheck.mockClear()
})

describe('ServerSessionLoader action order', () => {
  it('claims the session before re-checking restored practice answers', async () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    await waitFor(() => expect(calls).toContain('recheck'))
    expect(calls[0]).toBe('claim')
  })
})
