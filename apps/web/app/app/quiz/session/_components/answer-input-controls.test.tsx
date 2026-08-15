import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'
import type { Question } from './answer-input-controls'
import { DialogFillAnswer } from './answer-input-controls'

// ---- Mocks -----------------------------------------------------------------

vi.mock('./dialog-fill-input', () => ({
  DialogFillInput: ({
    submittedBlanks,
  }: Readonly<{
    template: string
    onSubmit: (blanks: { index: number; text: string }[]) => void
    disabled: boolean
    submittedBlanks?: { index: number; text: string }[] | null
  }>) => (
    <div data-testid="dialog-fill-input" data-submitted-blanks={JSON.stringify(submittedBlanks)} />
  ),
}))

// ---- Helpers ---------------------------------------------------------------

const QUESTION: Question = {
  id: 'q-df',
  question_text: 'Complete the ATC dialog',
  question_image_url: null,
  question_number: '050-01-01-003',
  explanation_text: null,
  explanation_image_url: null,
  options: [],
  question_type: 'dialog_fill',
  dialog_template: '[atc] {{0}} runway {{1}}.',
} as unknown as Question

function makeState(overrides: Partial<QuizState> = {}): QuizState {
  return {
    currentFeedback: null,
    submitting: false,
    answering: false,
    existingAnswer: undefined,
    handleDialogFillAnswer: vi.fn(),
    ...overrides,
  } as unknown as QuizState
}

// ---- Tests -----------------------------------------------------------------

describe('DialogFillAnswer', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('forwards the resumed answer as submittedBlanks so a returning student sees what they typed', () => {
    const s = makeState({
      existingAnswer: {
        blankAnswers: [
          { index: 0, text: 'clear to land' },
          { index: 1, text: '27' },
        ],
        responseTimeMs: 600,
      },
    } as Partial<QuizState>)
    render(<DialogFillAnswer s={s} question={QUESTION} />)
    expect(screen.getByTestId('dialog-fill-input')).toHaveAttribute(
      'data-submitted-blanks',
      JSON.stringify([
        { index: 0, text: 'clear to land' },
        { index: 1, text: '27' },
      ]),
    )
  })

  it('passes null submittedBlanks when the question has not been answered before', () => {
    const s = makeState({ existingAnswer: undefined } as Partial<QuizState>)
    render(<DialogFillAnswer s={s} question={QUESTION} />)
    expect(screen.getByTestId('dialog-fill-input')).toHaveAttribute(
      'data-submitted-blanks',
      JSON.stringify(null),
    )
  })
})
