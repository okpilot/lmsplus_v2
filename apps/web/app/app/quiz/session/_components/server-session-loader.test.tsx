import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBootstrap, quizProps } = vi.hoisted(() => ({
  mockBootstrap: vi.fn(),
  quizProps: { current: null as Record<string, unknown> | null },
}))

vi.mock('../_hooks/use-server-session-bootstrap', () => ({
  useServerSessionBootstrap: (...a: unknown[]) => mockBootstrap(...a),
}))
vi.mock('./quiz-session', () => ({
  QuizSession: (p: Record<string, unknown>) => {
    quizProps.current = p
    return <div data-testid="quiz-session" />
  },
}))

import type { SessionRunnerData } from '../_loaders/load-session-entry'
import { ServerSessionLoader } from './server-session-loader'

const Q = [{ id: 'q1' }, { id: 'q2' }]
const FB_Q1 = { questionType: 'multiple_choice', isCorrect: true, correctOptionId: 'a' }
const FB_GONE = { questionType: 'multiple_choice', isCorrect: false, correctOptionId: 'b' }
const RUNNER = {
  questions: Q,
  flaggedIds: ['q1'],
  feedback: { q1: FB_Q1, gone: FB_GONE },
} as unknown as SessionRunnerData
const ENTRY = {
  kind: 'open' as const,
  sessionId: 's1',
  mode: 'quick_quiz' as const,
  questionIds: ['q1', 'q2'],
  startedAt: '2026-10-01T10:00:00.000Z',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  seed: {
    answers: {
      q1: { selectedOptionId: 'a', responseTimeMs: 5 },
      gone: { selectedOptionId: 'b', responseTimeMs: 1 },
    },
    activeMs: 42_000,
    pinnedQuestionIds: ['q2'],
    currentIndex: 1,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  quizProps.current = null
  mockBootstrap.mockReturnValue({ claimError: null })
})

describe('ServerSessionLoader', () => {
  it('shows the first question before the claim has settled', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
  })

  it('shows the load error without claiming the session', () => {
    render(
      <ServerSessionLoader userId="u1" entry={ENTRY} runner={{ error: 'No questions found' }} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('No questions found')
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'alert')
    expect(screen.getByRole('alert')).toHaveClass('bg-danger-soft')
    expect(mockBootstrap).not.toHaveBeenCalled()
  })

  it('keeps the running quiz when a later server render fails to load the questions', () => {
    const { rerender } = render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    rerender(
      <ServerSessionLoader userId="u1" entry={ENTRY} runner={{ error: 'No questions found' }} />,
    )

    expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the first questions when a later server render reloads them', () => {
    const next = {
      questions: [{ id: 'reshuffled' }],
      flaggedIds: [],
    } as unknown as SessionRunnerData
    const { rerender } = render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    rerender(<ServerSessionLoader userId="u1" entry={ENTRY} runner={next} />)

    expect(quizProps.current?.questions).toBe(Q)
  })

  it('shows the quiz when a later server render loads the questions after a failed first load', () => {
    const { rerender } = render(
      <ServerSessionLoader userId="u1" entry={ENTRY} runner={{ error: 'No questions found' }} />,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('claims the session for this tab without handing the bootstrap any questions', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(mockBootstrap).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1' })
  })

  it('seeds the runner with the restored feedback of the served questions only', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(quizProps.current?.initialFeedback).toEqual(new Map([['q1', FB_Q1]]))
  })

  it('continues where the student left off', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(quizProps.current).toMatchObject({
      userId: 'u1',
      sessionId: 's1',
      questions: Q,
      initialFlaggedIds: ['q1'],
      initialIndex: 1,
      initialPinnedIds: ['q2'],
      initialActiveMs: 42_000,
      mode: 'study',
      startedAt: ENTRY.startedAt,
      subjectName: 'Air Law',
      subjectCode: 'ALW',
      initialSaveError: null,
    })
    expect(quizProps.current?.initialAnswers).toEqual({
      q1: { selectedOptionId: 'a', responseTimeMs: 5 },
    })
  })

  it('opens an exam as an exam of its mode with its clock and pass mark', () => {
    render(
      <ServerSessionLoader
        userId="u1"
        entry={{ ...ENTRY, mode: 'mock_exam', timeLimitSeconds: 600, passMark: 75 }}
        runner={RUNNER}
      />,
    )

    expect(quizProps.current).toMatchObject({
      mode: 'exam',
      examMode: 'mock_exam',
      timeLimitSeconds: 600,
      passMark: 75,
    })
  })

  it('passes the claim error to the runner save error', () => {
    mockBootstrap.mockReturnValue({ claimError: 'Another tab' })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(quizProps.current?.initialSaveError).toBe('Another tab')
  })

  it('still mounts the runner when the claim failed', () => {
    mockBootstrap.mockReturnValue({ claimError: 'Another tab' })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} runner={RUNNER} />)

    expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
  })
})
