import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnswerResult } from '../_types/session'
import { SessionAnswerBlock } from './session-answer-block'

// ---- Mocks ------------------------------------------------------------------

vi.mock('./answer-options', () => ({
  AnswerOptions: (props: {
    options: { id: string; text: string }[]
    onSubmit: (id: string) => void
    disabled: boolean
    correctOptionId?: string | null
    selectedOptionId?: string | null
  }) => (
    <div
      data-testid="answer-options"
      data-disabled={String(props.disabled)}
      data-selected-option-id={props.selectedOptionId ?? ''}
      data-correct-option-id={props.correctOptionId ?? ''}
    />
  ),
}))

vi.mock('./feedback-panel', () => ({
  FeedbackPanel: (props: {
    isCorrect: boolean
    explanationText: string | null
    explanationImageUrl: string | null
    onNext: () => void
  }) => (
    <div
      data-testid="feedback-panel"
      data-is-correct={String(props.isCorrect)}
      data-explanation-text={props.explanationText ?? ''}
      data-explanation-image-url={props.explanationImageUrl ?? ''}
    />
  ),
}))

// ---- Fixtures ---------------------------------------------------------------

const OPTIONS = [
  { id: 'opt-a', text: 'Option A' },
  { id: 'opt-b', text: 'Option B' },
]

const FEEDBACK_DATA: Extract<AnswerResult, { success: true }> = {
  success: true,
  isCorrect: true,
  correctOptionId: 'opt-a',
  explanationText: null,
  explanationImageUrl: null,
}

function makeProps(
  overrides: Partial<Parameters<typeof SessionAnswerBlock>[0]> = {},
): Parameters<typeof SessionAnswerBlock>[0] {
  return {
    options: OPTIONS,
    onSubmit: vi.fn(),
    submitting: false,
    state: 'answering',
    feedbackData: null,
    selectedOption: null,
    onNext: vi.fn(),
    ...overrides,
  }
}

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- selected option visibility ---------------------------------------------

describe('SessionAnswerBlock — selected option is preserved across states', () => {
  it('shows no selection when no option has been chosen', () => {
    render(<SessionAnswerBlock {...makeProps({ selectedOption: null })} />)
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('')
  })

  it('keeps the selected choice visible before feedback arrives', () => {
    render(<SessionAnswerBlock {...makeProps({ selectedOption: 'opt-b' })} />)
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('opt-b')
  })

  it('keeps the selected choice visible after feedback arrives', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({
          state: 'feedback',
          feedbackData: FEEDBACK_DATA,
          selectedOption: 'opt-a',
        })}
      />,
    )
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('opt-a')
  })
})

// ---- feedback display behavior ----------------------------------------------

describe('SessionAnswerBlock — feedback display behavior', () => {
  it('does not render FeedbackPanel in the answering state', () => {
    render(<SessionAnswerBlock {...makeProps()} />)
    expect(screen.queryByTestId('feedback-panel')).toBeNull()
  })

  it('renders FeedbackPanel when state is feedback and feedbackData is present', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('feedback-panel')).toBeTruthy()
  })

  it('does not render FeedbackPanel when state is feedback but feedbackData is null', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: null, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.queryByTestId('feedback-panel')).toBeNull()
    // Regression guard for #318: selection must stay visible even without feedbackData
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('opt-a')
  })
})

// ---- option selection is disabled during submit and feedback ----------------

describe('SessionAnswerBlock — disables option selection while submitting or in feedback', () => {
  it('enables AnswerOptions when not submitting and not in feedback state', () => {
    render(<SessionAnswerBlock {...makeProps({ submitting: false, state: 'answering' })} />)
    expect(screen.getByTestId('answer-options').dataset.disabled).toBe('false')
  })

  it('disables AnswerOptions while submitting', () => {
    render(<SessionAnswerBlock {...makeProps({ submitting: true })} />)
    expect(screen.getByTestId('answer-options').dataset.disabled).toBe('true')
  })

  it('disables AnswerOptions in the feedback state', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('answer-options').dataset.disabled).toBe('true')
  })
})

// ---- correct/incorrect feedback display -------------------------------------

describe('SessionAnswerBlock — displays correct or incorrect in the feedback panel', () => {
  it('shows correct when the answer is right', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('feedback-panel').dataset.isCorrect).toBe('true')
  })

  it('shows incorrect when the answer is wrong', () => {
    const incorrectFeedback: Extract<AnswerResult, { success: true }> = {
      success: true,
      isCorrect: false,
      correctOptionId: 'opt-a',
      explanationText: null,
      explanationImageUrl: null,
    }
    render(
      <SessionAnswerBlock
        {...makeProps({
          state: 'feedback',
          feedbackData: incorrectFeedback,
          selectedOption: 'opt-b',
        })}
      />,
    )
    expect(screen.getByTestId('feedback-panel').dataset.isCorrect).toBe('false')
  })
})

// ---- correct answer highlighting --------------------------------------------

describe('SessionAnswerBlock — highlights the correct option in feedback state', () => {
  it('reveals the correct answer after feedback arrives', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('answer-options').dataset.correctOptionId).toBe('opt-a')
  })

  it('does not reveal the correct answer while still answering', () => {
    render(<SessionAnswerBlock {...makeProps()} />)
    expect(screen.getByTestId('answer-options').dataset.correctOptionId).toBe('')
  })
})
