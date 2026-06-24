import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { isQuestionAnswered, ReportAnswerBody } from './report-answer-body'

const mcQuestion: QuizReportQuestion = {
  questionId: 'q1',
  questionText: 'What is lift?',
  questionNumber: null,
  questionType: 'multiple_choice',
  isCorrect: true,
  selectedOptionId: 'opt-a',
  correctOptionId: 'opt-a',
  options: [{ id: 'opt-a', text: 'Upward force' }],
  explanationText: null,
  explanationImageUrl: null,
  questionImageUrl: null,
  responseTimeMs: 1000,
}

const shortAnswerQuestion: QuizReportQuestion = {
  questionId: 'q2',
  questionText: 'Distress call?',
  questionNumber: null,
  questionType: 'short_answer',
  isCorrect: true,
  responseText: 'mayday',
  canonicalAnswer: 'mayday',
  explanationText: null,
  explanationImageUrl: null,
  questionImageUrl: null,
  responseTimeMs: 2000,
}

const dialogQuestion: QuizReportQuestion = {
  questionId: 'q3',
  questionText: 'Fill it.',
  questionNumber: null,
  questionType: 'dialog_fill',
  isCorrect: false,
  blanks: [
    { index: 0, responseText: 'cleared', canonical: 'cleared', isCorrect: true },
    { index: 1, responseText: null, canonical: 'climb', isCorrect: false },
  ],
  correctCount: 1,
  totalBlanks: 2,
  explanationText: null,
  explanationImageUrl: null,
  questionImageUrl: null,
  responseTimeMs: 3000,
}

describe('ReportAnswerBody', () => {
  it('renders the option list for a multiple-choice question', () => {
    render(<ReportAnswerBody question={mcQuestion} />)
    expect(screen.getByText('Upward force')).toBeInTheDocument()
  })

  it('renders the student response for a short-answer question', () => {
    render(<ReportAnswerBody question={shortAnswerQuestion} />)
    expect(screen.getByText('mayday')).toBeInTheDocument()
  })

  it('renders the blank fraction for a dialog-fill question', () => {
    render(<ReportAnswerBody question={dialogQuestion} />)
    expect(screen.getByText('1 / 2 blanks correct')).toBeInTheDocument()
  })
})

describe('isQuestionAnswered', () => {
  it('treats a multiple-choice selection that matches an option as answered', () => {
    expect(isQuestionAnswered(mcQuestion)).toBe(true)
  })

  it('treats a multiple-choice question with no matching selection as unanswered', () => {
    expect(isQuestionAnswered({ ...mcQuestion, selectedOptionId: 'nope' })).toBe(false)
  })

  it('treats a non-empty short-answer response as answered', () => {
    expect(isQuestionAnswered(shortAnswerQuestion)).toBe(true)
  })

  it('treats a blank short-answer response as unanswered', () => {
    expect(isQuestionAnswered({ ...shortAnswerQuestion, responseText: '   ' })).toBe(false)
  })

  it('treats a dialog with at least one filled blank as answered', () => {
    expect(isQuestionAnswered(dialogQuestion)).toBe(true)
  })

  it('treats a dialog with all blanks empty as unanswered', () => {
    const empty: QuizReportQuestion = {
      ...dialogQuestion,
      blanks: [{ index: 0, responseText: null, canonical: 'x', isCorrect: false }],
    }
    expect(isQuestionAnswered(empty)).toBe(false)
  })
})
