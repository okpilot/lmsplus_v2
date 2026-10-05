import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockBootstrap, mockUpload, quizProps } = vi.hoisted(() => ({
  mockBootstrap: vi.fn(),
  mockUpload: vi.fn(),
  quizProps: { current: null as Record<string, unknown> | null },
}))

vi.mock('../_hooks/use-server-session-bootstrap', () => ({
  useServerSessionBootstrap: (...a: unknown[]) => mockBootstrap(...a),
}))
vi.mock('../_hooks/use-local-answer-upload', () => ({
  useLocalAnswerUpload: (...a: unknown[]) => mockUpload(...a),
}))
vi.mock('./quiz-session', () => ({
  QuizSession: (p: Record<string, unknown>) => {
    quizProps.current = p
    return <div data-testid="quiz-session" />
  },
}))

import { ServerSessionLoader } from './server-session-loader'

const Q = [{ id: 'q1' }, { id: 'q2' }]
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
  mockBootstrap.mockReturnValue({ questions: Q, flaggedIds: ['q1'], claimError: null, error: null })
  mockUpload.mockImplementation(({ serverAnswers }: { serverAnswers: unknown }) => ({
    answers: serverAnswers,
  }))
})

describe('ServerSessionLoader', () => {
  it('shows a skeleton until the questions have loaded', () => {
    mockBootstrap.mockReturnValue({
      questions: null,
      flaggedIds: [],
      claimError: null,
      error: null,
    })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(screen.queryByTestId('quiz-session')).not.toBeInTheDocument()
  })

  it('shows the load error', () => {
    mockBootstrap.mockReturnValue({
      questions: null,
      flaggedIds: [],
      claimError: null,
      error: 'No questions found',
    })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No questions found')
  })

  it('waits for the local copy to be read before mounting the runner', () => {
    mockUpload.mockReturnValue({ answers: null })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(screen.queryByTestId('quiz-session')).not.toBeInTheDocument()
  })

  it('continues where the student left off', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

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
    mockBootstrap.mockReturnValue({
      questions: Q,
      flaggedIds: [],
      claimError: 'Another tab',
      error: null,
    })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(quizProps.current?.initialSaveError).toBe('Another tab')
  })

  it('uploads local answers only after a claim that landed without error', () => {
    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)
    expect(mockUpload).toHaveBeenLastCalledWith(expect.objectContaining({ claimed: true }))

    mockBootstrap.mockReturnValue({
      questions: Q,
      flaggedIds: [],
      claimError: 'Another tab',
      error: null,
    })
    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)
    expect(mockUpload).toHaveBeenLastCalledWith(expect.objectContaining({ claimed: false }))
  })

  it('tells the upload when the claim failed', () => {
    mockBootstrap.mockReturnValue({
      questions: Q,
      flaggedIds: [],
      claimError: 'Another tab',
      error: null,
    })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(mockUpload).toHaveBeenLastCalledWith(expect.objectContaining({ claimFailed: true }))
  })

  it('still mounts the runner when the claim failed', () => {
    mockBootstrap.mockReturnValue({
      questions: Q,
      flaggedIds: [],
      claimError: 'Another tab',
      error: null,
    })

    render(<ServerSessionLoader userId="u1" entry={ENTRY} />)

    expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
  })
})
