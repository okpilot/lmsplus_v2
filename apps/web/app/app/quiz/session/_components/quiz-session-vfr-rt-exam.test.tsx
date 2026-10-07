import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const mockCheckNonMcAnswer = vi.fn()
vi.mock('../../actions/check-non-mc-answer', () => ({
  checkNonMcAnswer: (...args: unknown[]) => mockCheckNonMcAnswer(...args),
}))
vi.mock('../../actions/check-answer', () => ({ checkAnswer: vi.fn() }))
vi.mock('../../actions/finish', () => ({ finishQuizSession: vi.fn() }))
vi.mock('../../actions/discard', () => ({ discardQuiz: vi.fn() }))
vi.mock('../../actions/end-discovery', () => ({ endDiscovery: vi.fn() }))

vi.mock('../../_components/question-grid', () => ({
  QuestionGrid: () => <div data-testid="question-grid" />,
}))

vi.mock('../_hooks/use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({
    flaggedIds: new Set<string>(),
    isFlagged: () => false,
    toggleFlag: vi.fn(),
    isToggling: () => false,
  }),
}))

import { QuizSession } from './quiz-session'

const baseQuestion = {
  question_image_url: null,
  question_number: null,
  explanation_text: null,
  explanation_image_url: null,
  options: [],
  dialog_template: null,
  blanks_safe: null,
  ordering_items: null,
  diagram_config: null,
}

const SHORT = {
  ...baseQuestion,
  id: 'q-short',
  question_text: 'Say the callsign',
  question_type: 'short_answer' as const,
}

const ORDERING = {
  ...baseQuestion,
  id: 'q-order',
  question_text: 'Order the calls',
  question_type: 'ordering' as const,
  ordering_items: [
    { id: 'i1', text: 'First call' },
    { id: 'i2', text: 'Second call' },
  ],
}

function renderExam(
  questions: (typeof SHORT | typeof ORDERING)[],
  initialAnswers?: React.ComponentProps<typeof QuizSession>['initialAnswers'],
) {
  return render(
    <QuizSession
      sessionId="sess-rt"
      questions={questions}
      userId="test-user-id"
      mode="exam"
      examMode="vfr_rt_exam"
      timeLimitSeconds={1800}
      initialAnswers={initialAnswers}
    />,
  )
}

describe('QuizSession — VFR RT exam non-MC answering', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the short-answer input without an unsupported alert', () => {
    renderExam([SHORT])
    expect(screen.getByTestId('short-answer-input')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('locks a submitted short answer without grading it or calling the server', async () => {
    renderExam([SHORT])
    const input = screen.getByTestId('short-answer-input')
    fireEvent.change(input, { target: { value: 'Golf Alpha' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByTestId('short-answer-input')).toBeDisabled())
    expect(screen.getByTestId('short-answer-input')).toHaveValue('Golf Alpha')
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument()
    expect(mockCheckNonMcAnswer).not.toHaveBeenCalled()
  })

  it('restores a locked short answer after a remount', () => {
    renderExam([SHORT], { 'q-short': { responseText: 'Golf Alpha', responseTimeMs: 900 } })
    expect(screen.getByTestId('short-answer-input')).toBeDisabled()
    expect(screen.getByTestId('short-answer-input')).toHaveValue('Golf Alpha')
  })

  it('restores a locked ordering answer after a remount', () => {
    renderExam([ORDERING], { 'q-order': { order: ['i2', 'i1'], responseTimeMs: 900 } })
    expect(screen.getByText('First call')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Answer' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('ordering-result')).not.toBeInTheDocument()
  })
})
