import { describe, expect, it } from 'vitest'
import type { QuizReportQuestion } from './quiz-report'
import { isQuestionAnswered } from './report-question-answered'

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

const orderingQuestion: QuizReportQuestion = {
  questionId: 'q4',
  questionText: 'Order the distress call.',
  questionNumber: null,
  questionType: 'ordering',
  isCorrect: false,
  slots: [
    { position: 0, responseText: 'mayday', canonicalText: 'mayday', isCorrect: true },
    { position: 1, responseText: null, canonicalText: 'position', isCorrect: false },
  ],
  correctCount: 1,
  totalItems: 2,
  explanationText: null,
  explanationImageUrl: null,
  questionImageUrl: null,
  responseTimeMs: 4000,
}

const diagramQuestion: QuizReportQuestion = {
  questionId: 'q5',
  questionText: 'Label the pattern legs.',
  questionNumber: null,
  questionType: 'diagram_label',
  isCorrect: false,
  zones: [
    { blankIndex: 0, placedLabel: 'Upwind', correctLabel: 'Upwind', isCorrect: true },
    { blankIndex: 1, placedLabel: null, correctLabel: 'Crosswind', isCorrect: false },
  ],
  correctCount: 1,
  totalZones: 2,
  explanationText: null,
  explanationImageUrl: null,
  questionImageUrl: null,
  responseTimeMs: 5000,
}

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

  it('treats an ordering question with at least one placed item as answered', () => {
    expect(isQuestionAnswered(orderingQuestion)).toBe(true)
  })

  it('treats an ordering question with every slot empty as unanswered', () => {
    const empty: QuizReportQuestion = {
      ...orderingQuestion,
      slots: [{ position: 0, responseText: null, canonicalText: 'mayday', isCorrect: false }],
    }
    expect(isQuestionAnswered(empty)).toBe(false)
  })

  it('treats a diagram-label question with at least one placed zone as answered', () => {
    expect(isQuestionAnswered(diagramQuestion)).toBe(true)
  })

  it('treats a diagram-label question with every zone unplaced as unanswered', () => {
    const empty: QuizReportQuestion = {
      ...diagramQuestion,
      zones: [{ blankIndex: 0, placedLabel: null, correctLabel: 'Upwind', isCorrect: false }],
    }
    expect(isQuestionAnswered(empty)).toBe(false)
  })
})
