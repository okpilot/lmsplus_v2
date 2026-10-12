import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizMainPanel } from './quiz-main-panel'

vi.mock('@/app/app/_components/question-card', () => ({
  QuestionCard: () => <div data-testid="question-card" />,
}))
vi.mock('./answer-input', () => ({
  AnswerInput: () => <div data-testid="answer-input" />,
}))
vi.mock('./quiz-tab-content', () => ({
  QuizTabContent: () => <div data-testid="quiz-tab-content" />,
}))

const s = {
  question: {
    question_text: 'What is lift?',
    question_image_url: null,
    explanation_text: null,
    explanation_image_url: null,
    question_type: 'multiple_choice',
  },
  questionId: 'q1',
  existingAnswer: undefined,
  error: null,
} as unknown as QuizState

describe('QuizMainPanel surface', () => {
  it('shows the question and its answer input together on one card surface', () => {
    render(<QuizMainPanel s={s} activeTab="question" userId="u1" />)
    const card = screen.getByTestId('question-card').closest('.bg-card')
    expect(card).not.toBeNull()
    expect(card).toContainElement(screen.getByTestId('answer-input'))
  })

  it('shows tab content on a card surface', () => {
    render(<QuizMainPanel s={s} activeTab="explanation" userId="u1" />)
    expect(screen.getByTestId('quiz-tab-content').closest('.bg-card')).not.toBeNull()
  })
})
