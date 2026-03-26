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
  FeedbackPanel: (props: { isCorrect: boolean; onNext: () => void }) => (
    <div data-testid="feedback-panel" data-is-correct={String(props.isCorrect)} />
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

// ---- selectedOptionId prop --------------------------------------------------

describe('SessionAnswerBlock — selectedOptionId forwarding', () => {
  it('passes null to AnswerOptions when no option is selected in the answering state', () => {
    render(<SessionAnswerBlock {...makeProps({ selectedOption: null })} />)
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('')
  })

  it('passes the selected option id to AnswerOptions while answering, before any submission', () => {
    render(<SessionAnswerBlock {...makeProps({ selectedOption: 'opt-b' })} />)
    expect(screen.getByTestId('answer-options').dataset.selectedOptionId).toBe('opt-b')
  })

  it('passes the selected option id to AnswerOptions in the feedback state', () => {
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

// ---- FeedbackPanel visibility -----------------------------------------------

describe('SessionAnswerBlock — FeedbackPanel visibility', () => {
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
  })
})

// ---- AnswerOptions disabled state -------------------------------------------

describe('SessionAnswerBlock — AnswerOptions disabled state', () => {
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

// ---- FeedbackPanel isCorrect value ------------------------------------------

describe('SessionAnswerBlock — FeedbackPanel isCorrect value', () => {
  it('passes isCorrect=true to FeedbackPanel when feedbackData marks the answer correct', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('feedback-panel').dataset.isCorrect).toBe('true')
  })

  it('passes isCorrect=false to FeedbackPanel when feedbackData marks the answer incorrect', () => {
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

// ---- correctOptionId forwarding ---------------------------------------------

describe('SessionAnswerBlock — correctOptionId forwarding', () => {
  it('passes correctOptionId from feedbackData to AnswerOptions in feedback state', () => {
    render(
      <SessionAnswerBlock
        {...makeProps({ state: 'feedback', feedbackData: FEEDBACK_DATA, selectedOption: 'opt-a' })}
      />,
    )
    expect(screen.getByTestId('answer-options').dataset.correctOptionId).toBe('opt-a')
  })

  it('passes no correctOptionId to AnswerOptions in the answering state', () => {
    render(<SessionAnswerBlock {...makeProps()} />)
    expect(screen.getByTestId('answer-options').dataset.correctOptionId).toBe('')
  })
})
